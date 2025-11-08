// src/modules/membership-levels/membership-level.entity.ts
import { type MembershipBenefits } from '@app-types/models/membership-levels.types';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 会员等级实体
 * 对应数据库表：member_membership_levels
 */
@Entity('member_membership_levels')
@Index('uk_code', ['code'], { unique: true })
export class MembershipLevelEntity {
  /** 主键 ID */
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  /** 等级代码，如 VIP1/VIP2 */
  @Column({
    name: 'code',
    type: 'varchar',
    length: 32,
    nullable: false,
    comment: '等级代码，如 VIP1/VIP2',
  })
  code!: string;

  /** 等级名称，如 白银会员 */
  @Column({
    name: 'name',
    type: 'varchar',
    length: 64,
    nullable: false,
    comment: '等级名称，如 白银会员',
  })
  name!: string;

  /** 权益描述，扩展用（ JSON ） */
  @Column({ name: 'benefits', type: 'json', nullable: true, comment: '权益描述，扩展用' })
  benefits!: MembershipBenefits | null;
}
