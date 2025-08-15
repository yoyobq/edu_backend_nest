// src/modules/thirdPartyAuth/dto/unbind-third-party.input.ts
import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsPositive } from 'class-validator';
import '../graphql/enums/third-party-provider.enum';

/**
 * 解绑第三方登录输入类型
 */
@InputType()
export class UnbindThirdPartyInput {
  @Field(() => ID, { nullable: true, description: '第三方登录绑定记录 ID' })
  @IsOptional()
  @IsPositive()
  id?: number;

  @Field(() => ThirdPartyProviderEnum, { nullable: true, description: '第三方平台类型' })
  @IsOptional()
  @IsEnum(ThirdPartyProviderEnum)
  provider?: ThirdPartyProviderEnum;
}
