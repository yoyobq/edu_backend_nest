// src/modules/thirdPartyAuth/dto/third-party-login.input.ts
import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ThirdPartyProviderEnum } from '../../../types/models/account.types';
import '../../account/graphql/enums/third-party-provider.enum';

/**
 * 第三方登录输入参数
 */
@InputType()
export class ThirdPartyLoginInput {
  @Field(() => ThirdPartyProviderEnum, { description: '第三方平台类型' })
  @IsEnum(ThirdPartyProviderEnum)
  provider!: ThirdPartyProviderEnum;

  @Field({ description: '第三方平台返回的登录凭证，如授权码 code 或访问令牌 token' })
  @IsString()
  @IsNotEmpty()
  authCredential!: string;

  @Field({ nullable: true, description: '客户端 IP 地址' })
  @IsOptional()
  @IsString()
  ip?: string;

  @Field({ nullable: true, description: '客户端类型' })
  @IsOptional()
  @IsString()
  audience?: string;
}
