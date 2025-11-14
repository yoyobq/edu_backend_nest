// 文件位置：src/adapters/graphql/course/series/dto/series.types.ts
import { ClassMode, CourseSeriesStatus, VenueType } from '@app-types/models/course-series.types';
import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType()
export class CreateSeriesInputGql {
  @Field(() => Int)
  catalogId!: number;
  @Field(() => String, { nullable: true })
  title?: string;
  @Field(() => String, { nullable: true })
  description?: string | null;
  @Field(() => VenueType, { nullable: true })
  venueType?: VenueType;
  @Field(() => ClassMode, { nullable: true })
  classMode?: ClassMode;
  @Field(() => String)
  startDate!: string;
  @Field(() => String)
  endDate!: string;
  @Field(() => String, { nullable: true })
  recurrenceRule?: string | null;
  @Field(() => Int, { nullable: true })
  leaveCutoffHours?: number;
  @Field(() => Float, { nullable: true })
  pricePerSession?: number | null;
  @Field(() => Float, { nullable: true })
  teachingFeeRef?: number | null;
  @Field(() => Int, { nullable: true })
  maxLearners?: number;
  @Field(() => String, { nullable: true })
  remark?: string | null;
}

@ObjectType()
export class CourseSeriesDTO {
  @Field(() => Int)
  id!: number;
  @Field(() => Int)
  catalogId!: number;
  @Field(() => String)
  title!: string;
  @Field(() => String, { nullable: true })
  description!: string | null;
  @Field(() => VenueType)
  venueType!: VenueType;
  @Field(() => ClassMode)
  classMode!: ClassMode;
  @Field(() => String)
  startDate!: string;
  @Field(() => String)
  endDate!: string;
  @Field(() => String, { nullable: true })
  recurrenceRule!: string | null;
  @Field(() => Int)
  leaveCutoffHours!: number;
  @Field(() => String, { nullable: true })
  pricePerSession!: string | null;
  @Field(() => String, { nullable: true })
  teachingFeeRef!: string | null;
  @Field(() => Int)
  maxLearners!: number;
  @Field(() => CourseSeriesStatus)
  status!: CourseSeriesStatus;
  @Field(() => String, { nullable: true })
  remark!: string | null;
  @Field(() => Date)
  createdAt!: Date;
  @Field(() => Date)
  updatedAt!: Date;
  @Field(() => Int, { nullable: true })
  createdBy!: number | null;
  @Field(() => Int, { nullable: true })
  updatedBy!: number | null;
}
