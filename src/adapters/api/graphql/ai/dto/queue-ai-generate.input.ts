// src/adapters/api/graphql/ai/dto/queue-ai-generate.input.ts
import { trimText } from '@core/common/text/text.helper';
import { Field, InputType } from '@nestjs/graphql';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

type AiProviderInput = 'openai' | 'qwen' | 'deepseek' | 'kimi';
const AI_PROVIDERS: ReadonlyArray<AiProviderInput> = ['openai', 'qwen', 'deepseek', 'kimi'];

@InputType()
export class QueueAiGenerateInput {
  @Field(() => String, { nullable: true, description: 'AI 提供方' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimText(value))
  @IsString({ message: 'AI 提供方必须是字符串' })
  @IsIn(AI_PROVIDERS, { message: 'AI 提供方不在允许范围内' })
  @MaxLength(32, { message: 'AI 提供方长度不能超过 32 个字符' })
  provider?: AiProviderInput;

  @Field(() => String, { description: '模型名称' })
  @Transform(({ value }: TransformFnParams) => trimText(value))
  @IsString({ message: '模型名称必须是字符串' })
  @IsNotEmpty({ message: '模型名称不能为空' })
  @MaxLength(128, { message: '模型名称长度不能超过 128 个字符' })
  model!: string;

  @Field(() => String, { description: '生成提示词' })
  @Transform(({ value }: TransformFnParams) => trimText(value))
  @IsString({ message: '生成提示词必须是字符串' })
  @IsNotEmpty({ message: '生成提示词不能为空' })
  @MaxLength(12000, { message: '生成提示词长度不能超过 12000 个字符' })
  prompt!: string;

  @Field(() => GraphQLJSON, { nullable: true, description: '扩展元数据' })
  @IsOptional()
  @ValidateIf((input: QueueAiGenerateInput) => input.metadata !== undefined)
  @IsObject({ message: '扩展元数据必须是对象' })
  metadata?: Readonly<Record<string, string>>;

  @Field(() => String, { nullable: true, description: '幂等键' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimText(value))
  @IsString({ message: '幂等键必须是字符串' })
  dedupKey?: string;

  @Field(() => String, { nullable: true, description: '链路追踪 ID' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimText(value))
  @IsString({ message: '链路追踪 ID 必须是字符串' })
  traceId?: string;
}
