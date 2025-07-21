import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AccessGroupItem,
  Gender,
  GeographicInfo,
  TagItem,
  UserState,
} from '../../../types/models/user-info.types';
import { AccountEntity } from './account.entity';

@Entity('base_user_info')
export class UserInfoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'account_id' })
  accountId!: number;

  @ManyToOne(() => AccountEntity)
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

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '头像' })
  avatar!: string | null;

  @Column({ type: 'varchar', length: 50, comment: '邮箱' })
  email!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '个性签名' })
  signature!: string | null;

  @Column({ name: 'access_group', type: 'json', comment: '用户分组 ["guest"]' })
  accessGroup!: AccessGroupItem[];

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '地址' })
  address!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '电话' })
  phone!: string | null;

  @Column({ type: 'json', nullable: true, comment: '标签' })
  tags!: TagItem[] | null;

  @Column({ type: 'json', nullable: true, comment: '地理位置' })
  geographic!: GeographicInfo | null;

  @Column({
    name: 'meta_digest',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '私有数据加密字段',
  })
  metaDigest!: string | null;

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
