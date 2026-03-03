import 'reflect-metadata';

export const ENCRYPTED_FIELDS_METADATA_KEY = 'core:encrypted_fields';

const encryptedField = (): PropertyDecorator => {
  return (target: object, propertyKey: string | symbol) => {
    const existing = (Reflect.getMetadata(ENCRYPTED_FIELDS_METADATA_KEY, target.constructor) ??
      []) as (string | symbol)[];
    Reflect.defineMetadata(
      ENCRYPTED_FIELDS_METADATA_KEY,
      [...new Set([...existing, propertyKey])],
      target.constructor,
    );
  };
};

export { encryptedField as EncryptedField };
