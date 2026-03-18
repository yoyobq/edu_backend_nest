// src/usecases/identity-management/coach/coach.input.normalize.ts

import {
  ACCOUNT_ERROR,
  DomainError,
  INPUT_NORMALIZE_ERROR,
} from '@core/common/errors/domain-error';
import { normalizeOptionalText } from '@core/common/input-normalize/input-normalize.policy';

export interface UpdateCoachInputNormalizeInput {
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
  specialty?: string | null;
  remark?: string | null;
}

export interface UpdateCoachInputNormalizeOutput {
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
  specialty?: string | null;
  remark?: string | null;
}

export function normalizeUpdateCoachInput(
  input: UpdateCoachInputNormalizeInput,
): UpdateCoachInputNormalizeOutput {
  const normalizedName = normalizeCoachName(input.name);
  const normalizedDescription = normalizeCoachDescription(input.description);
  const normalizedAvatarUrl = normalizeCoachAvatarUrl(input.avatarUrl);
  const normalizedSpecialty = normalizeCoachSpecialty(input.specialty);
  const normalizedRemark = normalizeCoachRemark(input.remark);

  return {
    ...(typeof normalizedName === 'undefined' ? {} : { name: normalizedName }),
    ...(typeof normalizedDescription === 'undefined' ? {} : { description: normalizedDescription }),
    ...(typeof normalizedAvatarUrl === 'undefined' ? {} : { avatarUrl: normalizedAvatarUrl }),
    ...(typeof normalizedSpecialty === 'undefined' ? {} : { specialty: normalizedSpecialty }),
    ...(typeof normalizedRemark === 'undefined' ? {} : { remark: normalizedRemark }),
  };
}

function normalizeCoachName(input: unknown): string | undefined {
  const normalized = normalizeSceneOptionalText(input, 'reject', '教练姓名');
  if (normalized === null || typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized.length > 64) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '教练姓名长度不能超过 64');
  }
  return normalized;
}

function normalizeCoachDescription(input: unknown): string | null | undefined {
  const normalized = normalizeSceneOptionalText(input, 'to_null', '简介');
  if (typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized !== null && normalized.length > 2000) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '简介长度不能超过 2000');
  }
  return normalized;
}

function normalizeCoachAvatarUrl(input: unknown): string | null | undefined {
  const normalized = normalizeSceneOptionalText(input, 'to_null', '头像 URL');
  if (typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized !== null && normalized.length > 255) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '头像 URL 长度不能超过 255');
  }
  return normalized;
}

function normalizeCoachSpecialty(input: unknown): string | null | undefined {
  const normalized = normalizeSceneOptionalText(input, 'to_null', '专长');
  if (typeof normalized === 'undefined') {
    return undefined;
  }
  if (normalized !== null && normalized.length > 100) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '专长长度不能超过 100');
  }
  return normalized;
}

function normalizeCoachRemark(input: unknown): string | null | undefined {
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
  policy: 'to_undefined' | 'to_null' | 'reject',
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
