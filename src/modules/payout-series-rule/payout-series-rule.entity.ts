// src/modules/payout-series-rule/payout-series-rule.entity.ts
import { type PayoutRuleJson } from '@app-types/models/payout-series-rule.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 课程系列结算规则/模板实体（教练课酬计算依据）
 * 对应数据库表：payout_series_rule
 */
@Entity('payout_series_rule')
@Index('uk_series', ['seriesId'], { unique: true })
export class PayoutSeriesRuleEntity {
  /** 主键 ID */
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  /** 系列 ID（引用 course_series.id；为空表示规则模板） */
  @Column({
    name: 'series_id',
    type: 'int',
    nullable: true,
    comment: '引用 course_series.id；为空表示规则模板',
  })
  seriesId!: number | null;

  /** 课酬规则定义（ JSON ） */
  @Column({ name: 'rule_json', type: 'json', nullable: false, comment: '课酬规则定义（JSON）' })
  ruleJson!: PayoutRuleJson;

  /** 规则说明 */
  @Column({
    name: 'description',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '规则说明，例如：2024 年夏季游泳班课酬规则 / 上门课模板',
  })
  description!: string | null;

  /** 是否为模板（1=模板，0=课程绑定规则） */
  @Column({
    name: 'is_template',
    type: 'tinyint',
    width: 1,
    default: () => '0',
    nullable: false,
    comment: '是否为模板（1=模板，0=课程绑定规则）',
  })
  isTemplate!: number;

  /** 是否启用 */
  @Column({
    name: 'is_active',
    type: 'tinyint',
    width: 1,
    default: () => '1',
    nullable: false,
    comment: '是否启用',
  })
  isActive!: number;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp', comment: '记录创建时间' })
  createdAt!: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', comment: '记录最后更新时间' })
  updatedAt!: Date;

  /** 创建者账号 ID */
  @Column({ name: 'created_by', type: 'int', nullable: true, comment: '创建人' })
  createdBy!: number | null;

  /** 更新者账号 ID */
  @Column({ name: 'updated_by', type: 'int', nullable: true, comment: '修改人' })
  updatedBy!: number | null;
}
