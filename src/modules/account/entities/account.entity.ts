import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus, IdentityTypeEnum } from '../../../types/models/account.types';
import '../graphql/enums/account-status.enum';
import '../graphql/enums/identity-type.enum';
import { LoginHistoryItem } from '../graphql/types';

@ObjectType()
@Entity('base_user_accounts')
export class AccountEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn({ comment: 'primary key' })
  id!: number;

  // 此处的 ! 并非非空断言，而是代表此属性交给 TypeORM 来填值，它的值可能是 string 或 null，但它一定会被初始化
  @Field(() => String, { nullable: true, description: '账号名' })
  @Column({ name: 'login_name', type: 'varchar', length: 30, nullable: true, comment: '账号名' })
  loginName!: string | null;

  @Field(() => String, { nullable: true, description: '账号邮箱' })
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
