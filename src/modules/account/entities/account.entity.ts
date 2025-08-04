import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus } from '../../../types/models/account.types';
import '../graphql/enums/account-status.enum';
import '../graphql/enums/identity-type.enum';
import { LoginHistoryItem } from '../graphql/types/login-history.types';
import { ThirdPartyAuthEntity } from './third-party-auth.entity';
import { UserInfoEntity } from './user-info.entity';

@Entity('base_user_accounts')
export class AccountEntity {
  @PrimaryGeneratedColumn({ type: 'int', comment: 'primary key' })
  id!: number;

  // 修改 loginName 字段，添加 nullable: true
  @Column({
    name: 'login_name',
    type: 'varchar',
    length: 30,
    nullable: true,
    comment: '账号名',
  })
  loginName!: string | null;

  @Column({
    name: 'login_email',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: '账号email',
  })
  loginEmail!: string;

  @Column({ name: 'login_password', type: 'varchar', length: 255, comment: '密码' })
  loginPassword!: string;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING,
    comment: '"ACTIVE=1"、"BANNED=2"、"DELETED=3"、"PENDING=4"、"SUSPENDED=5"、"INACTIVE=6"',
  })
  status!: AccountStatus;

  @Column({ name: 'recent_login_history', type: 'json', nullable: true, comment: '最近5次登录IP' })
  recentLoginHistory!: LoginHistoryItem[] | null;

  @Column({
    name: 'identity_hint',
    type: 'varchar',
    length: 30,
    nullable: true,
    comment: '身份提示字段，用于加速判断',
  })
  identityHint!: string | null;

  /**
   * 用户详细信息关联
   * 一对一关系的反向端（inverse side）
   */
  @OneToOne(() => UserInfoEntity, (userInfo) => userInfo.account)
  userInfo?: UserInfoEntity;

  /**
   * 第三方登录绑定关联
   * 一对多关系
   */
  @OneToMany(() => ThirdPartyAuthEntity, (thirdPartyAuth) => thirdPartyAuth.account, {
    eager: false,
  })
  thirdPartyAuths?: ThirdPartyAuthEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime', comment: 'created time' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', comment: 'updated time' })
  updatedAt!: Date;
}
