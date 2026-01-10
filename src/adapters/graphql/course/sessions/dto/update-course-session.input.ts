// src/adapters/graphql/course/sessions/dto/update-course-session.input.ts
import { Field, ID, InputType } from '@nestjs/graphql';
import { IsDate, IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

@InputType()
export class UpdateCourseSessionInput {
  @Field(() => ID, { description: '节次 ID' })
  @IsInt({ message: '节次 ID 必须是整数' })
  @Min(1, { message: '节次 ID 必须大于 0' })
  id!: number;

  @Field(() => Date, { nullable: true, description: '开始时间' })
  @IsOptional()
  @IsDate({ message: '开始时间必须是 Date 类型' })
  startTime?: Date;

  @Field(() => Date, { nullable: true, description: '结束时间' })
  @IsOptional()
  @IsDate({ message: '结束时间必须是 Date 类型' })
  endTime?: Date;

  @Field(() => String, { nullable: true, description: '地点文本' })
  @IsOptional()
  @IsString({ message: '地点必须是字符串' })
  @MaxLength(255, { message: '地点长度不能超过 255 个字符' })
  locationText?: string | null;

  @Field(() => ID, { nullable: true, description: '主教练 ID' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt({ message: '主教练 ID 必须是整数' })
  @Min(1, { message: '主教练 ID 必须大于 0' })
  leadCoachId?: number;

  @Field(() => String, { nullable: true, description: '备注' })
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  @MaxLength(512, { message: '备注长度不能超过 512 个字符' })
  remark?: string | null;
}
