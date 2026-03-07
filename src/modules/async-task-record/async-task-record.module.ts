import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsyncTaskRecordEntity } from './async-task-record.entity';
import { AsyncTaskRecordService } from './async-task-record.service';
import { AsyncTaskRecordQueryService } from './queries/async-task-record.query.service';

@Module({
  imports: [TypeOrmModule.forFeature([AsyncTaskRecordEntity])],
  providers: [AsyncTaskRecordService, AsyncTaskRecordQueryService],
  exports: [TypeOrmModule, AsyncTaskRecordService, AsyncTaskRecordQueryService],
})
export class AsyncTaskRecordModule {}
