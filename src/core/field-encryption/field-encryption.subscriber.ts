import { Injectable } from '@nestjs/common';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import { FieldEncryptionService } from './field-encryption.service';

/**
 * TypeORM 实体订阅者：
 * - 插入/更新前自动对标记字段加密
 * - 加载后自动对标记字段解密
 */
@Injectable()
@EventSubscriber()
export class FieldEncryptionSubscriber implements EntitySubscriberInterface<unknown> {
  private readonly crypto = new FieldEncryptionService();

  /** 实体插入前自动加密 */
  beforeInsert(event: InsertEvent<unknown>): void {
    if (event.entity) this.crypto.encryptEntity(event.entity);
  }

  /** 实体更新前自动加密 */
  beforeUpdate(event: UpdateEvent<unknown>): void {
    if (event.entity) this.crypto.encryptEntity(event.entity);
  }

  /** 实体加载后自动解密 */
  afterLoad(entity: unknown): void {
    this.crypto.decryptEntity(entity);
  }
}
