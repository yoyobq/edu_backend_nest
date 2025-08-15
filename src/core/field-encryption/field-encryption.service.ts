import { FIELD_ENCRYPTION_CONFIG } from '@core/config/field-encryption.config';
import { Injectable } from '@nestjs/common';
import * as CryptoJS from 'crypto-js';
import { ENCRYPTED_FIELDS_METADATA_KEY } from './field-encryption.decorator';

/**
 * 面向 ORM 的字段级加解密服务
 * - 提供 encrypt/decrypt 基元
 * - 提供对实体对象的透明加/解密（配合装饰器）
 */
@Injectable()
export class FieldEncryptionService {
  private readonly KEY = CryptoJS.lib.WordArray.create(
    CryptoJS.enc.Utf8.parse(FIELD_ENCRYPTION_CONFIG.KEY).words,
    FIELD_ENCRYPTION_CONFIG.META.KEY_LENGTH, // AES-128 需要 16 字节
  );

  private readonly IV = CryptoJS.lib.WordArray.create(
    CryptoJS.enc.Utf8.parse(FIELD_ENCRYPTION_CONFIG.IV).words,
    FIELD_ENCRYPTION_CONFIG.META.IV_LENGTH, // CBC 模式需要 16 字节 IV
  );

  /** 加密字符串 */
  encrypt(plain: string): string {
    return CryptoJS.AES.encrypt(plain, this.KEY, {
      iv: this.IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  }

  /** 解密字符串 */
  decrypt(cipher: string): string {
    return CryptoJS.AES.decrypt(cipher, this.KEY, {
      iv: this.IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
  }

  /** 对实体对象按标记字段加密（支持 string/对象/数组） */
  encryptEntity(entity: unknown) {
    if (typeof entity !== 'object' || entity === null) return;
    const fields = (Reflect.getMetadata(ENCRYPTED_FIELDS_METADATA_KEY, entity.constructor) ??
      []) as (string | symbol)[];
    for (const field of fields) {
      const val = (entity as Record<string | symbol, unknown>)[field];
      if (typeof val === 'string' && val) {
        (entity as Record<string | symbol, unknown>)[field] = this.encrypt(val);
      } else if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
        const jsonString = JSON.stringify(val);
        (entity as Record<string | symbol, unknown>)[field] = this.encrypt(jsonString);
      }
    }
  }

  /** 对实体对象按标记字段解密（字符串→尽量转回原类型） */
  decryptEntity(entity: unknown) {
    if (typeof entity !== 'object' || entity === null) return;
    const fields = (Reflect.getMetadata(ENCRYPTED_FIELDS_METADATA_KEY, entity.constructor) ??
      []) as (string | symbol)[];
    for (const field of fields) {
      const val = (entity as Record<string | symbol, unknown>)[field];
      if (typeof val === 'string' && val) {
        try {
          const decrypted = this.decrypt(val);
          try {
            (entity as Record<string | symbol, unknown>)[field] = JSON.parse(decrypted);
          } catch {
            (entity as Record<string | symbol, unknown>)[field] = decrypted;
          }
        } catch {
          // TODO: 解密失败时保留原始值，避免数据丢失（可在调用方记录错误）
        }
      }
    }
  }
}
