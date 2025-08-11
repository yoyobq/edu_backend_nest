// src/modules/account/entities/third-party-auth.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ThirdPartyProviderEnum } from '../../../types/models/account.types';
import { AccountEntity } from './account.entity';

/**
 * 第三方登录绑定实体类
 */
@Entity('base_third_party_auth')
@Unique('base_third_party_auth_provider_IDX', ['provider', 'providerUserId'])
@Unique('base_third_party_auth_account_id_IDX', ['accountId', 'provider'])
export class ThirdPartyAuthEntity {
  @PrimaryGeneratedColumn({ type: 'int', comment: '主键' })
  id!: number;

  @Column({ name: 'account_id', type: 'int', comment: '关联账号 base_user_accounts.id' })
  accountId!: number;

  @Column({
    type: 'enum',
    enum: ThirdPartyProviderEnum,
    comment: '第三方平台类型',
  })
  provider!: ThirdPartyProviderEnum;

  @Column({
    name: 'provider_user_id',
    type: 'varchar',
    length: 128,
    comment: '平台返回的用户唯一标识，如微信 openid、Google sub',
  })
  providerUserId!: string;

  @Column({
    name: 'union_id',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '例如微信的 unionid，防御性保留字段',
  })
  unionId!: string | null;

  @Column({
    name: 'access_token',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '短期使用的 access_token，仅调试用途',
  })
  accessToken!: string | null;

  /**
   * 关联的账号实体
   */
  @ManyToOne(() => AccountEntity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', comment: '更新时间' })
  updatedAt!: Date;
}
