import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CatStatus {
  ACTIVE = 'ACTIVE',
  ADOPTED = 'ADOPTED',
  LOST = 'LOST',
  DEAD = 'DEAD',
}

// 注册 GraphQL 枚举类型
registerEnumType(CatStatus, {
  name: 'CatStatus',
  description: '猫的状态',
});

@ObjectType()
@Entity('z_test_cats')
export class Cat {
  @Field(() => Int, { description: 'Cat 的唯一标识符' })
  @PrimaryGeneratedColumn()
  id!: number;

  @Field(() => String, { description: 'Cat 的名称', nullable: true })
  @Column({ length: 100, nullable: true })
  name?: string;

  @Field(() => CatStatus)
  @Column({ type: 'enum', enum: CatStatus, default: CatStatus.ACTIVE })
  // 由于数据库对枚举类型设置了默认值，所以这里可以给非空 ! 断言，但这样造成了用户在 create 或者 update 的时候此处 status 可以是 ? 的问题，
  // 时间久了很容易忘记为什么两边对数据的要求不一致，所以建议在 create 或者 update status 传值时，强制服务端传给定值
  status!: CatStatus;

  @Field({ description: '创建时间' })
  @CreateDateColumn({ name: 'createdAt' })
  createdAt!: Date;

  @Field({ description: '更新时间' })
  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt!: Date;
}
