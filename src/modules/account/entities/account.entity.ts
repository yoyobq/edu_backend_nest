import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus, LoginHistoryItem } from '../../../types/models/account.types';

@Entity('base_user_accounts')
export class AccountEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  // 此处的 ! 并非非空断言，而是代表此属性我会交给 TypeORM 来填值，它的值可能是 string 或 null，但它一定会被初始化，不是 undefined
  @Column({ name: 'login_name', type: 'varchar', length: 30, nullable: true, comment: '账号名' })
  loginName!: string | null;

  @Column({
    name: 'login_email',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: '账号email',
  })
  loginEmail!: string | null;

  @Column({ name: 'login_password', type: 'varchar', length: 255, comment: '密码' })
  loginPassword!: string;

  @Column({ name: 'recent_login_history', type: 'json', nullable: true, comment: '最近5次登录IP' })
  recentLoginHistory!: LoginHistoryItem[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', comment: 'created time' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', comment: 'updated time' })
  updatedAt!: Date;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING,
    comment: '"ACTIVE=1"、"BANNED=2"、"DELETED=3"、"PENDING=4"、"SUSPENDED=5"、"INACTIVE=6"',
  })
  status!: AccountStatus;
}
