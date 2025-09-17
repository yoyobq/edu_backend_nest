// src/modules/account/entities/user-info.entity.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Gender, UserState, type GeographicInfo } from '@app-types/models/user-info.types';
import { EncryptedField } from '@core/field-encryption';
import { Field, ID } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import '../../../../adapters/graphql/account/dto/user-state.enum';
import '../../../../adapters/graphql/account/enums/gender.enum';
import { AccountEntity } from './account.entity';

@Entity('base_user_info')
export class UserInfoEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn({ type: 'int', comment: '主键' })
  id!: number;

  @Column({ name: 'account_id', type: 'int', comment: 'user_accouts.id' })
  accountId!: number;

  @OneToOne(() => AccountEntity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @Column({ type: 'varchar', length: 50, comment: '昵称' })
  nickname!: string;

  @Column({
    type: 'enum',
    enum: Gender,
    default: Gender.SECRET,
    comment: '性别',
  })
  gender!: Gender;

  @Column({ name: 'birth_date', type: 'date', nullable: true, comment: '出生日期，仅保留年月日' })
  birthDate!: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 255, nullable: true, comment: '头像 Url' })
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '邮箱' })
  email!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '个性签名' })
  signature!: string | null;

  @Column({ name: 'access_group', type: 'json', comment: '用户分组 ["registrant"]' })
  accessGroup!: IdentityTypeEnum[];

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '地址' })
  address!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '电话' })
  phone!: string | null;

  @Column({ type: 'json', nullable: true, comment: '标签' })
  tags!: string[] | null;

  @Column({ type: 'json', nullable: true, comment: '地理位置' })
  geographic!: GeographicInfo | null;

  @Column({
    name: 'meta_digest',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '私有数据加密字段',
  })
  @EncryptedField() // 使用新的加密装饰器
  metaDigest!: IdentityTypeEnum[] | null; // 修改：从 string | null 改为 IdentityTypeEnum[] | null

  @Column({ name: 'notify_count', type: 'int', default: 0, comment: '通知数' })
  notifyCount!: number;

  @Column({ name: 'unread_count', type: 'int', default: 0, comment: '未读通知数' })
  unreadCount!: number;

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
