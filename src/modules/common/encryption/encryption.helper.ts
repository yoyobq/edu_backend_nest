// modules/common/encryption/encryption.helper.ts
import { Injectable } from '@nestjs/common';
import * as CryptoJS from 'crypto-js';
import 'reflect-metadata';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import {
  ENCRYPTED_FIELDS_KEY,
  ENCRYPTION_IV,
  ENCRYPTION_KEY,
} from '../constants/encryption.constants';

const KEY = CryptoJS.lib.WordArray.create(
  CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY).words,
  16, // AES-128 需要 16 字节
);

const IV = CryptoJS.lib.WordArray.create(
  CryptoJS.enc.Utf8.parse(ENCRYPTION_IV).words,
  16, // CBC 模式需要 16 字节 IV
);

@Injectable()
@EventSubscriber()
export class EncryptionHelper implements EntitySubscriberInterface<unknown> {
  /** 加密字符串 */
  encrypt(plain: string): string {
    return CryptoJS.AES.encrypt(plain, KEY, {
      iv: IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  }

  /** 解密字符串 */
  decrypt(cipher: string): string {
    return CryptoJS.AES.decrypt(cipher, KEY, {
      iv: IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
  }

  /** 实体插入前自动加密 */
  beforeInsert(event: InsertEvent<unknown>): void {
    this.encryptEntity(event.entity);
  }

  /** 实体更新前自动加密 */
  beforeUpdate(event: UpdateEvent<unknown>): void {
    if (event.entity) {
      this.encryptEntity(event.entity);
    }
  }

  /** 实体加载后自动解密 */
  afterLoad(entity: unknown): void {
    this.decryptEntity(entity);
  }

  /** 字段装饰器 */
  static EncryptedField(): PropertyDecorator {
    return (target: object, propertyKey: string | symbol) => {
      const existing = (Reflect.getMetadata(ENCRYPTED_FIELDS_KEY, target.constructor) ?? []) as (
        | string
        | symbol
      )[];
      Reflect.defineMetadata(
        ENCRYPTED_FIELDS_KEY,
        [...new Set([...existing, propertyKey])],
        target.constructor,
      );
    };
  }

  private encryptEntity(entity: unknown) {
    if (typeof entity !== 'object' || entity === null) return;

    const fields = (Reflect.getMetadata(ENCRYPTED_FIELDS_KEY, entity.constructor) ?? []) as (
      | string
      | symbol
    )[];

    for (const field of fields) {
      const val = (entity as Record<string | symbol, unknown>)[field];
      if (typeof val === 'string' && val) {
        (entity as Record<string | symbol, unknown>)[field] = this.encrypt(val);
      }
    }
  }

  private decryptEntity(entity: unknown) {
    if (typeof entity !== 'object' || entity === null) return;

    const fields = (Reflect.getMetadata(ENCRYPTED_FIELDS_KEY, entity.constructor) ?? []) as (
      | string
      | symbol
    )[];

    for (const field of fields) {
      const val = (entity as Record<string | symbol, unknown>)[field];
      if (typeof val === 'string' && val) {
        try {
          (entity as Record<string | symbol, unknown>)[field] = this.decrypt(val);
        } catch {
          // 解密失败时保留原始值，避免数据丢失
          // 如果需要记录错误，可以在调用方处理
        }
      }
    }
  }
}
