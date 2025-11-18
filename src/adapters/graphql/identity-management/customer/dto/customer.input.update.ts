// src/adapters/graphql/identity-management/customer/dto/customer.input.update.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 更新客户信息的 GraphQL 输入参数
 */
@InputType()
export class UpdateCustomerInput {
  @Field(() => Int, { nullable: true, description: '客户 ID（仅 manager 需要指定）' })
  @IsOptional()
  @IsInt({ message: '客户 ID 必须是整数' })
  customerId?: number;

  @Field(() => String, { nullable: true, description: '客户姓名' })
  @IsOptional()
  @IsString({ message: '客户姓名必须是字符串' })
  @MaxLength(64, { message: '客户姓名长度不能超过 64' })
  name?: string;

  @Field(() => String, { nullable: true, description: '联系电话' })
  @IsOptional()
  @IsString({ message: '联系电话必须是字符串' })
  @MaxLength(20, { message: '联系电话长度不能超过 20' })
  contactPhone?: string | null;

  @Field(() => String, { nullable: true, description: '偏好联系时间' })
  @IsOptional()
  @IsString({ message: '偏好联系时间必须是字符串' })
  @MaxLength(50, { message: '偏好联系时间长度不能超过 50' })
  preferredContactTime?: string | null;

  @Field(() => String, { nullable: true, description: '备注' })
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  @MaxLength(255, { message: '备注长度不能超过 255' })
  remark?: string | null;

  @Field(() => Int, { nullable: true, description: '会员等级 ID（仅 manager 可更新）' })
  @IsOptional()
  membershipLevel?: number;
}
