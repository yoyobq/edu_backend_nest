// src/usecases/identity-management/customer/customer.input.normalize.ts

import {
  ACCOUNT_ERROR,
  DomainError,
  INPUT_NORMALIZE_ERROR,
} from '@core/common/errors/domain-error';
import { normalizeOptionalText } from '@core/common/input-normalize/input-normalize.policy';

export interface UpdateCustomerInputNormalizeInput {
  name?: string;
  contactPhone?: string | null;
  preferredContactTime?: string | null;
  remark?: string | null;
}

export interface UpdateCustomerInputNormalizeOutput {
  name?: string;
  contactPhone?: string | null;
  preferredContactTime?: string | null;
  remark?: string | null;
}

export function normalizeUpdateCustomerInput(
  input: UpdateCustomerInputNormalizeInput,
): UpdateCustomerInputNormalizeOutput {
  const normalizedName = normalizeCustomerName(input.name);
  const normalizedContactPhone = normalizeCustomerContactPhone(input.contactPhone);
  const normalizedPreferredContactTime = normalizeCustomerPreferredContactTime(
    input.preferredContactTime,
  );
  const normalizedRemark = normalizeCustomerRemark(input.remark);

  return {
    ...(typeof normalizedName === 'undefined' ? {} : { name: normalizedName }),
    ...(typeof normalizedContactPhone === 'undefined'
      ? {}
      : { contactPhone: normalizedContactPhone }),
    ...(typeof normalizedPreferredContactTime === 'undefined'
      ? {}
      : { preferredContactTime: normalizedPreferredContactTime }),
    ...(typeof normalizedRemark === 'undefined' ? {} : { remark: normalizedRemark }),
  };
}

function normalizeCustomerName(input: unknown): string | undefined {
  const normalized = normalizeSceneOptionalText(input, 'to_undefined', '客户姓名');
  if (normalized === null || typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized.length > 64) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '客户姓名长度不能超过 64');
  }
  return normalized;
}

function normalizeCustomerContactPhone(input: unknown): string | null | undefined {
  const normalized = normalizeSceneOptionalText(input, 'to_null', '联系电话');
  if (typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized !== null && normalized.length > 20) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '联系电话长度不能超过 20');
  }
  return normalized;
}

function normalizeCustomerPreferredContactTime(input: unknown): string | null | undefined {
  const normalized = normalizeSceneOptionalText(input, 'to_null', '偏好联系时间');
  if (typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized !== null && normalized.length > 50) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '偏好联系时间长度不能超过 50');
  }
  return normalized;
}

function normalizeCustomerRemark(input: unknown): string | null | undefined {
  const normalized = normalizeSceneOptionalText(input, 'to_null', '备注');
  if (typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized !== null && normalized.length > 255) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '备注长度不能超过 255');
  }
  return normalized;
}

function normalizeSceneOptionalText(
  input: unknown,
  policy: 'to_undefined' | 'to_null',
  fieldName: string,
): string | null | undefined {
  try {
    return normalizeOptionalText(input, policy, { fieldName });
  } catch (error) {
    return mapNormalizeError(error);
  }
}

function mapNormalizeError(error: unknown): never {
  if (
    error instanceof DomainError &&
    (error.code === INPUT_NORMALIZE_ERROR.INVALID_TEXT ||
      error.code === INPUT_NORMALIZE_ERROR.OPTIONAL_TEXT_EMPTY_REJECTED)
  ) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, error.message);
  }
  throw error;
}
