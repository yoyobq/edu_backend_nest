// src/modules/course-catalogs/course-catalog.entity.ts

import { CourseLevel } from '@app-types/models/course.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 课程目录实体
 * 对应数据库表：course_catalogs
 * 用于存储课程规格/产品信息
 */
@Entity('course_catalogs')
@Index('uk_catalogs_course_level', ['courseLevel'], { unique: true })
export class CourseCatalogEntity {
  /**
   * 课程目录 ID，主键
   * 自增整型主键
   */
  @PrimaryGeneratedColumn({ type: 'int', comment: '课程目录主键 ID' })
  id!: number;

  /**
   * 课程等级
   * 枚举类型：FITNESS/WUSHU/STRIKING/SANDA/MMA
   * 具有唯一约束 uk_catalogs_course_level
   */
  @Column({
    name: 'course_level',
    type: 'enum',
    enum: CourseLevel,
    comment: '课程等级（固定枚举：体能/武术/搏击/散打/MMA）',
  })
  courseLevel!: CourseLevel;

  /**
   * 课程标题
   * 必填字段，最大长度 100 个字符
   */
  @Column({
    type: 'varchar',
    length: 100,
    comment: '课程标题',
  })
  title!: string;

  /**
   * 课程描述
   * 可为空，最大长度 512 个字符
   */
  @Column({
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '课程描述',
  })
  description!: string | null;

  /**
   * 下线时间
   * NULL=有效；非 NULL=下线
   */
  @Column({
    name: 'deactivated_at',
    type: 'datetime',
    nullable: true,
    comment: 'NULL=有效；非NULL=下线',
  })
  deactivatedAt!: Date | null;

  /**
   * 创建时间
   * 自动设置为当前时间戳
   */
  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    comment: '创建时间',
  })
  createdAt!: Date;

  /**
   * 更新时间
   * 自动更新为当前时间戳
   */
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    comment: '更新时间',
  })
  updatedAt!: Date;

  /**
   * 创建者 ID
   * 可为空，记录创建该课程目录的用户 ID
   */
  @Column({
    name: 'created_by',
    type: 'int',
    nullable: true,
    comment: '创建者 ID',
  })
  createdBy!: number | null;

  /**
   * 更新者 ID
   * 可为空，记录最后更新该课程目录的用户 ID
   */
  @Column({
    name: 'updated_by',
    type: 'int',
    nullable: true,
    comment: '更新者 ID',
  })
  updatedBy!: number | null;
}
