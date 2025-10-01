// src/adapters/graphql/verification-record/dto/verification-record.dto.ts

import { SubjectType, VerificationRecordType } from '@app-types/models/verification-record.types';
import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

// 导入枚举注册文件以确保 GraphQL 类型系统正确识别所有枚举
import '@src/adapters/graphql/verification-record/enums/verification-record-type.enum';

/**
 * 证书载荷输入类型
 */
@InputType({ description: '证书载荷数据' })
export class CertificatePayloadInput {
  @Field(() => String, { description: '证书标题' })
  title!: string;

  @Field(() => String, { description: '证书描述', nullable: true })
  description?: string;

  @Field(() => String, { description: '颁发机构' })
  issuer!: string;

  @Field(() => Int, { description: '课程 ID', nullable: true })
  courseId?: number;

  @Field(() => Int, { description: '技能 ID', nullable: true })
  skillId?: number;

  @Field(() => Int, { description: '成绩/评分', nullable: true })
  score?: number;

  @Field(() => String, { description: '等级', nullable: true })
  grade?: string;

  @Field(() => String, { description: '证书模板 ID', nullable: true })
  templateId?: string;

  @Field(() => String, { description: '额外元数据（JSON 字符串）', nullable: true })
  metadata?: string;
}

/**
 * 单个证书签发输入类型
 */
@InputType({ description: '单个证书签发参数' })
export class IssueSingleCertificateInput {
  @Field(() => VerificationRecordType, { description: '证书类型' })
  certificateType!: VerificationRecordType;

  @Field(() => Int, { description: '目标账号 ID' })
  targetAccountId!: number;

  @Field(() => SubjectType, { description: '主体类型', nullable: true })
  subjectType?: SubjectType;

  @Field(() => Int, { description: '主体 ID', nullable: true })
  subjectId?: number;

  @Field(() => String, { description: '证书标题' })
  title!: string;

  @Field(() => String, { description: '证书描述', nullable: true })
  description?: string;

  @Field(() => String, { description: '颁发机构' })
  issuer!: string;

  @Field(() => Int, { description: '课程 ID', nullable: true })
  courseId?: number;

  @Field(() => Int, { description: '技能 ID', nullable: true })
  skillId?: number;

  @Field(() => Int, { description: '成绩/评分', nullable: true })
  score?: number;

  @Field(() => String, { description: '等级', nullable: true })
  grade?: string;

  @Field(() => String, { description: '证书模板 ID', nullable: true })
  templateId?: string;

  @Field(() => String, { description: '额外元数据（JSON 字符串）', nullable: true })
  metadata?: string;

  @Field(() => Int, { description: '过期时间（小时数）', nullable: true, defaultValue: 8760 })
  expiresInHours?: number;

  @Field(() => Date, { description: '生效时间', nullable: true })
  notBefore?: Date;

  @Field(() => String, { description: '自定义 token', nullable: true })
  customToken?: string;

  @Field(() => Int, { description: 'token 长度', nullable: true, defaultValue: 64 })
  tokenLength?: number;
}

/**
 * 批量签发目标输入类型
 */
@InputType({ description: '批量签发目标' })
export class BatchCertificateTargetInput {
  @Field(() => Int, { description: '目标账号 ID' })
  targetAccountId!: number;

  @Field(() => SubjectType, { description: '主体类型', nullable: true })
  subjectType?: SubjectType;

  @Field(() => Int, { description: '主体 ID', nullable: true })
  subjectId?: number;

  @Field(() => CertificatePayloadInput, { description: '个性化载荷数据', nullable: true })
  personalizedPayload?: CertificatePayloadInput;
}

/**
 * 批量证书签发输入类型
 */
@InputType({ description: '批量证书签发参数' })
export class IssueBatchCertificatesInput {
  @Field(() => VerificationRecordType, { description: '证书类型' })
  certificateType!: VerificationRecordType;

  @Field(() => [BatchCertificateTargetInput], { description: '批量签发目标列表' })
  targets!: BatchCertificateTargetInput[];

  @Field(() => CertificatePayloadInput, { description: '通用证书载荷数据' })
  commonPayload!: CertificatePayloadInput;

  @Field(() => Int, { description: '过期时间（小时数）', nullable: true, defaultValue: 8760 })
  expiresInHours?: number;

  @Field(() => Date, { description: '生效时间', nullable: true })
  notBefore?: Date;

  @Field(() => Int, { description: 'token 长度', nullable: true, defaultValue: 64 })
  tokenLength?: number;
}

/**
 * 证书信息输出类型
 */
@ObjectType({ description: '证书信息' })
export class CertificateInfo {
  @Field(() => ID, { description: '验证记录 ID' })
  recordId!: number;

  @Field(() => String, { description: '证书 token' })
  token!: string;

  @Field(() => Int, { description: '目标账号 ID' })
  targetAccountId!: number;
}

/**
 * 证书签发结果输出类型
 */
@ObjectType({ description: '证书签发结果' })
export class IssueCertificateResult {
  @Field(() => [CertificateInfo], { description: '签发的证书列表' })
  certificates!: CertificateInfo[];

  @Field(() => Int, { description: '签发总数' })
  totalIssued!: number;
}
