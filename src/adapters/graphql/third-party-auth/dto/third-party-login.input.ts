// src/adapters/graphql/third-party-auth/dto/third-party-login.input.ts
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { Field, InputType } from '@nestjs/graphql';
import '@src/adapters/graphql/third-party-auth/enums/third-party-provider.enum';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  @Field(() => AudienceTypeEnum, { description: '客户端类型' })
  @IsEnum(AudienceTypeEnum, { message: '客户端类型无效' })
  audience!: AudienceTypeEnum;
}
