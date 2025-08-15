import 'reflect-metadata';

/**
 * 加密字段元数据键
 */
export const ENCRYPTED_FIELDS_METADATA_KEY = 'core:encrypted_fields';

/**
 * 字段装饰器：标记需要透明加解密的字段
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function EncryptedField(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing = (Reflect.getMetadata(ENCRYPTED_FIELDS_METADATA_KEY, target.constructor) ??
      []) as (string | symbol)[];
    Reflect.defineMetadata(
      ENCRYPTED_FIELDS_METADATA_KEY,
      [...new Set([...existing, propertyKey])],
      target.constructor,
    );
  };
}
