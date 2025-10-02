// src/adapters/graphql/verification-record/dto/consume-verification-record.input.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * 自定义 OneOf 校验器
 * 确保 id 或 token 至少提供其中之一
 */
@ValidatorConstraint({ name: 'OneOfIdOrToken', async: false })
class OneOfIdOrToken implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const v = args.object as { id?: number; token?: string };
    return !!(v.id || (v.token && v.token.length > 0));
  }

  defaultMessage(): string {
    return '必须提供 id 或 token 其中之一';
  }
}

/**
 * 消费验证记录输入参数
 */
@InputType({ description: '消费验证记录输入参数' })
export class ConsumeVerificationRecordInput {
  @Field(() => Int, { description: '验证记录 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: 'ID 必须是整数' })
  id?: number;

  @Field(() => String, { description: '验证 token', nullable: true })
  @IsOptional()
  @IsString({ message: 'token 必须是字符串' })
  token?: string;

  @Field(() => VerificationRecordType, { description: '期望的验证记录类型', nullable: true })
  @IsOptional()
  @IsEnum(VerificationRecordType, { message: '验证记录类型无效' })
  expectedType?: VerificationRecordType;

  // 使用自定义校验器确保 id 或 token 至少提供其中之一
  @Validate(OneOfIdOrToken)
  private readonly oneOfValidation?: boolean;

  // 以下字段仅供后端内部使用，不暴露给 GraphQL

  /** 消费者账号 ID（仅后端内部使用） */
  @IsOptional()
  @IsInt({ message: '消费者账号 ID 必须是整数' })
  consumedByAccountId?: number;
}
