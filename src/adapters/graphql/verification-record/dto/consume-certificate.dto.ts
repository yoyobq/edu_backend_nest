// src/adapters/graphql/verification-record/dto/consume-certificate.dto.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { Field, InputType, ObjectType } from '@nestjs/graphql';

/**
 * 消费证书输入类型
 */
@InputType({ description: '消费证书输入参数' })
export class ConsumeCertificateInput {
  @Field(() => String, { description: '证书 token' })
  token!: string;

  @Field(() => VerificationRecordType, { description: '期望的验证记录类型', nullable: true })
  expectedType?: VerificationRecordType;
}

/**
 * 验证记录简要信息
 */
@ObjectType({ description: '验证记录简要信息' })
export class VerificationRecordBrief {
  @Field(() => String, { description: '验证记录 ID' })
  id!: string;

  @Field(() => VerificationRecordType, { description: '验证记录类型' })
  type!: VerificationRecordType;

  @Field(() => String, { description: '验证记录状态' })
  status!: string;

  @Field(() => Date, { description: '消费时间', nullable: true })
  consumedAt?: Date;
}

/**
 * 消费证书结果
 */
@ObjectType({ description: '消费证书结果' })
export class ConsumeCertificateResult {
  @Field(() => Boolean, { description: '是否成功' })
  success!: boolean;

  @Field(() => String, { description: '消息', nullable: true })
  message?: string;

  @Field(() => VerificationRecordBrief, { description: '验证记录信息', nullable: true })
  record?: VerificationRecordBrief;
}

/**
 * 验证证书输入类型
 */
@InputType({ description: '验证证书输入参数' })
export class VerifyCertificateInput {
  @Field(() => String, { description: '证书 token' })
  token!: string;

  @Field(() => VerificationRecordType, { description: '期望的验证记录类型', nullable: true })
  expectedType?: VerificationRecordType;
}

/**
 * 验证证书结果
 */
@ObjectType({ description: '验证证书结果' })
export class VerifyCertificateResult {
  @Field(() => Boolean, { description: '是否有效' })
  valid!: boolean;

  @Field(() => VerificationRecordBrief, { description: '验证记录信息', nullable: true })
  certificate?: VerificationRecordBrief;
}
