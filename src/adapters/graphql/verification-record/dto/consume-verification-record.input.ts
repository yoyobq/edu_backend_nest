// src/adapters/graphql/verification-record/dto/consume-verification-record.input.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString, Validate } from 'class-validator';

/**
 * 自定义 OneOf 校验器
 * 确保 id 或 token 至少提供其中之一
 */
class OneOfIdOrToken {
  validate(_: unknown, ctx: { object: { id?: number; token?: string } }): boolean {
    const v = ctx.object;
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
  @Field(() => ID, { description: '验证记录 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: 'ID 必须是整数' })
  id?: number;

  @Field(() => String, { description: '验证令牌', nullable: true })
  @IsOptional()
  @IsString({ message: '令牌必须是字符串' })
  token?: string;

  @Field(() => VerificationRecordType, { description: '期望的记录类型（可选）', nullable: true })
  @IsOptional()
  @IsEnum(VerificationRecordType, { message: '期望类型无效' })
  expectedType?: VerificationRecordType;

  @Field(() => Int, { description: '消费者账号 ID（可选，默认取当前登录用户）', nullable: true })
  @IsOptional()
  @IsInt({ message: '消费者账号 ID 必须是整数' })
  consumedByAccountId?: number;

  @Validate(OneOfIdOrToken)
  oneOfValidation!: string;
}
