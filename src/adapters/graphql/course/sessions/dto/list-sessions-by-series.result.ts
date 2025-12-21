// src/adapters/graphql/course/sessions/dto/list-sessions-by-series.result.ts
import { Field, ObjectType } from '@nestjs/graphql';
import { CourseSessionDTO, CourseSessionSafeViewDTO } from './course-session.dto';

/**
 * 按开课班读取节次列表结果
 */
@ObjectType({ description: '节次列表结果' })
export class CourseSessionsBySeriesResult {
  @Field(() => [CourseSessionDTO], { description: '节次列表' })
  items!: CourseSessionDTO[];
}

@ObjectType({ description: '节次列表结果（安全视图）' })
export class CustomerCourseSessionsBySeriesResult {
  @Field(() => [CourseSessionSafeViewDTO], { description: '节次列表' })
  items!: CourseSessionSafeViewDTO[];
}
