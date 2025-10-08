// src/adapters/graphql/identity-management/dto/upgrade-to-customer.input.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import { Field, InputType } from '@nestjs/graphql';
import { IsEnum } from 'class-validator';

/**
 * 升级为客户的输入参数
 */
@InputType({ description: '升级为客户的输入参数' })
export class UpgradeToCustomerInput {
  @Field(() => AudienceTypeEnum, { description: '客户端类型' })
  @IsEnum(AudienceTypeEnum, { message: 'audience 必须是有效的客户端类型' })
  audience!: AudienceTypeEnum;
}
