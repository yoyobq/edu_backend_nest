// src/usecases/identity-management/manager/manager.input.normalize.ts

import {
  ACCOUNT_ERROR,
  DomainError,
  INPUT_NORMALIZE_ERROR,
} from '@core/common/errors/domain-error';
import { normalizeOptionalText } from '@core/common/input-normalize/input-normalize.policy';

export interface UpdateManagerInputNormalizeInput {
  name?: string;
  remark?: string | null;
}

export interface UpdateManagerInputNormalizeOutput {
  name?: string;
  remark?: string | null;
}

export function normalizeUpdateManagerInput(
  input: UpdateManagerInputNormalizeInput,
): UpdateManagerInputNormalizeOutput {
  const normalizedName = normalizeManagerName(input.name);
  const normalizedRemark = normalizeManagerRemark(input.remark);

  return {
    ...(typeof normalizedName === 'undefined' ? {} : { name: normalizedName }),
    ...(typeof normalizedRemark === 'undefined' ? {} : { remark: normalizedRemark }),
  };
}

function normalizeManagerName(input: unknown): string | undefined {
  const normalized = normalizeSceneOptionalText(input, 'to_undefined', '姓名');
  if (normalized === null || typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized.length > 64) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '姓名长度不能超过 64');
  }
  return normalized;
}

function normalizeManagerRemark(input: unknown): string | null | undefined {
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
