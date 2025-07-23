import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus, IdentityTypeEnum } from '../../../types/models/account.types';

// 注册枚举类型到 GraphQL Schema
registerEnumType(AccountStatus, {
  name: 'AccountStatus',
  description: '账号状态枚举',
  valuesMap: {
    ACTIVE: {
      description: '正常状态',
    },
    BANNED: {
      description: '封禁状态',
    },
    DELETED: {
      description: '已删除',
    },
    PENDING: {
      description: '待激活/待审核',
    },
    SUSPENDED: {
      description: '暂停使用',
    },
    INACTIVE: {
      description: '长期不活跃',
    },
  },
});

registerEnumType(IdentityTypeEnum, {
  name: 'IdentityTypeEnum',
  description: '身份类型枚举',
  valuesMap: {
    STAFF: {
      description: '教职工',
    },
    STUDENT: {
      description: '学生',
    },
    CUSTOMER: {
      description: '客户',
    },
    LEARNER: {
      description: '学员',
    },
  },
});

@ObjectType()
class LoginHistoryItem {
  @Field(() => String, { description: '登录 IP 地址' })
  ip!: string;

  @Field(() => String, { description: '登录时间（ISO 格式）' })
  timestamp!: string;

  @Field(() => String, { nullable: true, description: '客户端类型' })
  audience?: string;
}

@ObjectType()
@Entity('base_user_accounts')
export class AccountEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn({ comment: 'primary key' })
  id!: number;

  // 此处的 ! 并非非空断言，而是代表此属性交给 TypeORM 来填值，它的值可能是 string 或 null，但它一定会被初始化
  @Field({ nullable: true, description: '账号名' })
  @Column({ name: 'login_name', type: 'varchar', length: 30, nullable: true, comment: '账号名' })
  loginName!: string | null;

  @Field({ nullable: true, description: '账号邮箱' })
  @Column({
    name: 'login_email',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: '账号email',
  })
  loginEmail!: string | null;

  // 密码字段不暴露给 GraphQL
  @Column({ name: 'login_password', type: 'varchar', length: 255, comment: '密码' })
  loginPassword!: string;

  @Field(() => AccountStatus, { description: '账号状态' })
  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING,
    comment: '"ACTIVE=1"、"BANNED=2"、"DELETED=3"、"PENDING=4"、"SUSPENDED=5"、"INACTIVE=6"',
  })
  status!: AccountStatus;

  @Field(() => [LoginHistoryItem], { nullable: true, description: '最近登录历史' })
  @Column({ name: 'recent_login_history', type: 'json', nullable: true, comment: '最近5次登录IP' })
  recentLoginHistory!: LoginHistoryItem[] | null;

  @Field(() => IdentityTypeEnum, { nullable: true, description: '身份类型提示' })
  @Column({
    name: 'identity_hint',
    type: 'json',
    nullable: true,
    comment: '身份提示字段，用于加速判断',
  })
  identityHint!: IdentityTypeEnum | null;

  // 时间字段通常不暴露给前端
  @CreateDateColumn({ name: 'created_at', type: 'datetime', comment: 'created time' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', comment: 'updated time' })
  updatedAt!: Date;
}
