// src/adapters/graphql/third-party-auth/dto/unbind-third-party.input.ts
import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { Field, Int, InputType } from '@nestjs/graphql';
import '@src/adapters/graphql/third-party-auth/enums/third-party-provider.enum';
import { IsEnum, IsOptional, IsPositive } from 'class-validator';

/**
 * 解绑第三方登录输入类型
 */
@InputType()
export class UnbindThirdPartyInput {
  @Field(() => Int, { nullable: true, description: '第三方登录绑定记录 ID' })
  @IsOptional()
  @IsPositive()
  id?: number;

  @Field(() => ThirdPartyProviderEnum, { nullable: true, description: '第三方平台类型' })
  @IsOptional()
  @IsEnum(ThirdPartyProviderEnum)
  provider?: ThirdPartyProviderEnum;
}
