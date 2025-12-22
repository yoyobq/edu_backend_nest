// src/modules/course-series/course-series.entity.ts
import {
  ClassMode,
  CourseSeriesStatus,
  PublisherType,
  VenueType,
} from '@app-types/models/course-series.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 开课班实体
 * 对应数据库表：course_series
 * 用于管理开课班信息（由教务或教练发布）
 */
@Entity('course_series')
@Index('idx_series_publisher', ['publisherType', 'publisherId'])
@Index('idx_series_status', ['status'])
@Index('idx_series_catalog', ['catalogId'])
@Index('idx_series_dates', ['startDate', 'endDate'])
@Index('idx_series_class_mode', ['classMode'])
@Index('idx_series_status_start_date', ['status', 'startDate'])
@Index('idx_series_status_end_date', ['status', 'endDate'])
@Index('idx_series_created_at_id', ['createdAt', 'id'])
@Index('idx_series_updated_at_id', ['updatedAt', 'id'])
export class CourseSeriesEntity {
  /** 主键 ID */
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  /** 课程目录 ID（引用 course_catalogs.id） */
  @Column({ name: 'catalog_id', type: 'int', comment: '引用 course_catalogs.id（课程等级词条）' })
  catalogId!: number;

  /** 发布者身份类型 */
  @Column({ name: 'publisher_type', type: 'enum', enum: PublisherType, comment: '发布者身份类型' })
  publisherType!: PublisherType;

  /** 发布者在其身份表的 id（manager/coach） */
  @Column({
    name: 'publisher_id',
    type: 'int',
    comment: '发布者在其身份表的 id（member_manager/member_coach）',
  })
  publisherId!: number;

  /** 标题 */
  @Column({ type: 'varchar', length: 120 })
  title!: string;

  /** 描述 */
  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  /** 上课地点类型 */
  @Column({
    name: 'venue_type',
    type: 'enum',
    enum: VenueType,
    default: VenueType.SANDA_GYM,
    comment: '上课地点类型：SANDA_GYM=散打馆；TRACK_FIELD=田径场；CUSTOMER_HOME=客户家（上门）',
  })
  venueType!: VenueType;

  /** 班型 */
  @Column({
    name: 'class_mode',
    type: 'enum',
    enum: ClassMode,
    default: ClassMode.SMALL_CLASS,
    comment: '班型：SMALL_CLASS=小班课，LARGE_CLASS=大班课',
  })
  classMode!: ClassMode;

  /** 开班起始日期 */
  @Column({ name: 'start_date', type: 'date', comment: '开班起始日期' })
  startDate!: string; // 使用 date 字符串以符合 TypeORM 默认行为

  /** 开班结束日期 */
  @Column({ name: 'end_date', type: 'date', comment: '开班结束日期' })
  endDate!: string;

  /** 周期规则 */
  @Column({
    name: 'recurrence_rule',
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: '周期规则：如 BYDAY=MO,WE,FR;BYHOUR=9;BYMINUTE=0；NULL=不自动生成',
  })
  recurrenceRule!: string | null;

  /** 请假有效阈值（小时，开课班默认；课程节次可覆写） */
  @Column({
    name: 'leave_cutoff_hours',
    type: 'int',
    default: 12,
    comment: '请假有效阈值（小时，系列默认；节次可覆写）',
  })
  leaveCutoffHours!: number;

  /** 每节客户价（开课班默认） */
  @Column({
    name: 'price_per_session',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '每节客户价（系列默认）；收入=被扣费人数×此价',
  })
  pricePerSession!: string | null; // 使用字符串承载 decimal，避免 JS 精度问题

  /** 每节授课参考价（开课班默认） */
  @Column({
    name: 'teaching_fee_ref',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '每节授课参考价（系列默认；实际到人按 session_coaches 分配）',
  })
  teachingFeeRef!: string | null;

  /** 最大报名学员数（按班型检查约束） */
  @Column({ name: 'max_learners', type: 'int', default: 1, comment: '最大报名学员数' })
  maxLearners!: number;

  /** 班级状态 */
  @Column({
    name: 'status',
    type: 'enum',
    enum: CourseSeriesStatus,
    default: CourseSeriesStatus.PLANNED,
    comment: '班级状态：PLANNED/PUBLISHED/CLOSED/FINISHED',
  })
  status!: CourseSeriesStatus;

  /** 班级备注（Manager 可见） */
  @Column({
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '班级备注，Manager 可见，供管理端记录事项',
  })
  remark!: string | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  /** 创建者 ID */
  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy!: number | null;

  /** 更新者 ID */
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy!: number | null;
}
