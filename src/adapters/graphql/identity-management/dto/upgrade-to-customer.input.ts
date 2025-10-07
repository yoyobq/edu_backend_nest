// src/adapters/graphql/identity-management/dto/upgrade-to-customer.input.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * 升级为客户的输入参数
 */
@InputType({ description: '升级为客户的输入参数' })
export class UpgradeToCustomerInput {
  @Field(() => String, { description: '客户端类型（DESKTOP 或 WEAPP）' })
  @IsEnum(AudienceTypeEnum, { message: 'audience 必须是有效的客户端类型' })
  audience!: AudienceTypeEnum;

  @Field(() => String, {
    description: '微信小程序 OpenId（仅当 audience 为 WEAPP 时需要）',
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'weappOpenId 必须是字符串' })
  weappOpenId?: string;
}
