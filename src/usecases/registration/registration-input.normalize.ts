// src/usecases/registration/registration-input.normalize.ts

import { DomainError } from '@core/common/errors';
import { INPUT_NORMALIZE_ERROR } from '@core/common/errors/domain-error';
import {
  normalizeOptionalText,
  normalizeRequiredText,
} from '@core/common/input-normalize/input-normalize.policy';

interface RegisterWithEmailNormalizeInput {
  loginEmail: string;
  nickname?: string | null;
}

interface RegisterWithEmailNormalizeOutput {
  loginEmail: string;
  nickname?: string;
}

interface RegisterWithThirdPartyNormalizeInput {
  email?: string | null;
}

interface RegisterWithThirdPartyNormalizeOutput {
  email?: string;
}

interface WeappRegisterNormalizeOutput {
  defaultNickname: string;
}

export function normalizeRegisterWithEmailInput(
  input: RegisterWithEmailNormalizeInput,
): RegisterWithEmailNormalizeOutput {
  const normalizedLoginEmail = normalizeRequiredText(input.loginEmail, {
    fieldName: '登录邮箱',
  });
  return {
    loginEmail: normalizeRegistrationEmail(normalizedLoginEmail),
    nickname: normalizeRegistrationNickname(input.nickname),
  };
}

export function normalizeRegisterWithThirdPartyInput(
  input: RegisterWithThirdPartyNormalizeInput,
): RegisterWithThirdPartyNormalizeOutput {
  const normalizedEmail = normalizeOptionalText(input.email, 'to_undefined', {
    fieldName: '邮箱',
  });

  if (normalizedEmail === null) {
    return { email: undefined };
  }

  if (typeof normalizedEmail === 'undefined') {
    return { email: undefined };
  }

  return {
    email: normalizeRegistrationEmail(normalizedEmail),
  };
}

export function normalizeWeappRegisterInput(): WeappRegisterNormalizeOutput {
  return {
    defaultNickname: normalizeRegistrationNickname('微信用户') ?? '微信用户',
  };
}

function normalizeRegistrationNickname(value?: string | null): string | undefined {
  const normalizedNickname = normalizeOptionalText(value, 'to_undefined', {
    fieldName: '昵称',
  });

  if (normalizedNickname === null) {
    return undefined;
  }

  if (typeof normalizedNickname === 'undefined') {
    return undefined;
  }

  const transformedNickname = normalizeRegistrationNicknameText(normalizedNickname);
  const stableNickname = normalizeRequiredText(transformedNickname, {
    fieldName: '昵称',
  });
  return stableNickname;
}

function normalizeRegistrationEmail(value: string): string {
  return value.toLowerCase();
}

function normalizeRegistrationNicknameText(value: string): string {
  const normalized = value
    .replace(/[\uFF01-\uFF5E]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
    })
    .replace(/[\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      '',
    )
    .trim();

  if (normalized.length === 0) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.OPTIONAL_TEXT_EMPTY_REJECTED, '昵称 不能为空白');
  }

  return normalized;
}
