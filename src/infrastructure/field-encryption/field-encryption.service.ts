import { Injectable } from '@nestjs/common';
import * as CryptoJS from 'crypto-js';
import { ENCRYPTED_FIELDS_METADATA_KEY } from './field-encryption.decorator';

const FIELD_ENCRYPTION_CONFIG = {
  KEY: process.env.FIELD_ENCRYPTION_KEY ?? 'A9c3D7f1H5jL0xZ2',
  IV: process.env.FIELD_ENCRYPTION_IV ?? 'R3uX6yB9eH2kM5oQ',
  META: {
    ALGORITHM: 'AES-128-CBC',
    KEY_LENGTH: 16,
    IV_LENGTH: 16,
  } as const,
};

@Injectable()
export class FieldEncryptionService {
  private readonly KEY = CryptoJS.lib.WordArray.create(
    CryptoJS.enc.Utf8.parse(FIELD_ENCRYPTION_CONFIG.KEY).words,
    FIELD_ENCRYPTION_CONFIG.META.KEY_LENGTH,
  );

  private readonly IV = CryptoJS.lib.WordArray.create(
    CryptoJS.enc.Utf8.parse(FIELD_ENCRYPTION_CONFIG.IV).words,
    FIELD_ENCRYPTION_CONFIG.META.IV_LENGTH,
  );

  encrypt(plain: string): string {
    return CryptoJS.AES.encrypt(plain, this.KEY, {
      iv: this.IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  }

  decrypt(cipher: string): string {
    return CryptoJS.AES.decrypt(cipher, this.KEY, {
      iv: this.IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
  }

  encryptEntity(entity: unknown) {
    if (typeof entity !== 'object' || entity === null) return;
    const fields = (Reflect.getMetadata(ENCRYPTED_FIELDS_METADATA_KEY, entity.constructor) ??
      []) as (string | symbol)[];
    for (const field of fields) {
      const val = (entity as Record<string | symbol, unknown>)[field];

      if (typeof val === 'string' && val) {
        const encrypted = this.encrypt(val);
        (entity as Record<string | symbol, unknown>)[field] = encrypted;
      } else if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
        const jsonString = JSON.stringify(val);
        const encrypted = this.encrypt(jsonString);
        (entity as Record<string | symbol, unknown>)[field] = encrypted;
      }
    }
  }

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
            const parsed: unknown = JSON.parse(decrypted);

            (entity as Record<string | symbol, unknown>)[field] = parsed;
          } catch {
            (entity as Record<string | symbol, unknown>)[field] = decrypted;
          }
        } catch {
          continue;
        }
      }
    }
  }
}
