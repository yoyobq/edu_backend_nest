import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Gender, GeographicInfo, UserState } from '../../../types/models/user-info.types';
import { AccountEntity } from './account.entity';

@ObjectType()
@Entity('base_user_info')
export class UserInfoEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number;

  @Field({ description: '关联账号 ID' })
  @Column({ name: 'account_id' })
  accountId!: number;

  @Field(() => AccountEntity, { description: '关联账号信息' })
  @ManyToOne(() => AccountEntity)
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @Field({ description: '用户昵称' })
  @Column({ type: 'varchar', length: 50, comment: '昵称' })
  nickname!: string;

  @Field(() => Gender, { description: '性别' })
  @Column({
    type: 'enum',
    enum: Gender,
    default: Gender.SECRET,
    comment: '性别',
  })
  gender!: Gender;

  @Field({ nullable: true, description: '出生日期' })
  @Column({ name: 'birth_date', type: 'date', nullable: true, comment: '出生日期，仅保留年月日' })
  birthDate!: string | null;

  @Field({ nullable: true, description: '头像 URL' })
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '头像' })
  avatar!: string | null;

  @Field({ description: '邮箱地址' })
  @Column({ type: 'varchar', length: 50, comment: '邮箱' })
  email!: string;

  @Field({ nullable: true, description: '个性签名' })
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '个性签名' })
  signature!: string | null;

  @Field(() => [String], { description: '用户权限分组' })
  @Column({ name: 'access_group', type: 'json', comment: '用户分组 ["guest"]' })
  accessGroup!: string[];

  @Field({ nullable: true, description: '联系地址' })
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '地址' })
  address!: string | null;

  @Field({ nullable: true, description: '联系电话' })
  @Column({ type: 'varchar', length: 20, nullable: true, comment: '电话' })
  phone!: string | null;

  @Field(() => [String], { nullable: true, description: '用户标签' })
  @Column({ type: 'json', nullable: true, comment: '标签' })
  tags!: string[] | null;

  // @Field(() => GeographicInfo, { nullable: true, description: '地理位置信息' })
  @Column({ type: 'json', nullable: true, comment: '地理位置' })
  geographic!: GeographicInfo | null;

  // 私有数据加密字段不暴露
  @Column({
    name: 'meta_digest',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '私有数据加密字段',
  })
  metaDigest!: string | null;

  @Field({ description: '通知总数' })
  @Column({ name: 'notify_count', type: 'int', default: 0, comment: '通知数' })
  notifyCount!: number;

  @Field({ description: '未读通知数' })
  @Column({ name: 'unread_count', type: 'int', default: 0, comment: '未读通知数' })
  unreadCount!: number;

  @Field(() => UserState, { description: '用户状态' })
  @Column({
    name: 'user_state',
    type: 'enum',
    enum: UserState,
    default: UserState.PENDING,
    comment:
      '账户统一状态：ACTIVE=在读/在职，INACTIVE=离校/离职，SUSPENDED=暂离（休学/病休），PENDING=待完善',
  })
  userState!: UserState;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', comment: '更新时间' })
  updatedAt!: Date;
}
