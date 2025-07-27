// src/modules/thirdPartyAuth/dto/third-party-auth.dto.ts
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ThirdPartyProviderEnum } from '../../../types/models/account.types';
import '../../account/graphql/enums/third-party-provider.enum';

/**
 * 第三方登录绑定信息输出类型
 */
@ObjectType()
export class ThirdPartyAuthOutput {
  @Field(() => ID, { description: '主键' })
  id!: number;

  @Field({ description: '关联账号 ID' })
  accountId!: number;

  @Field(() => ThirdPartyProviderEnum, { description: '第三方平台类型' })
  provider!: ThirdPartyProviderEnum;

  @Field({ description: '平台返回的用户唯一标识' })
  providerUserId!: string;

  @Field(() => String, { nullable: true, description: '联合 ID，如微信的 unionid' })
  unionId?: string | null;

  @Field({ description: '创建时间' })
  createdAt!: Date;

  @Field({ description: '更新时间' })
  updatedAt!: Date;
}
