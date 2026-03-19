import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignBaseAsyncTaskRecordsTimeFields1773925700000 implements MigrationInterface {
  name = 'AlignBaseAsyncTaskRecordsTimeFields1773925700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`base_async_task_records\`
      MODIFY COLUMN \`occurred_at\` timestamp(3) NULL DEFAULT NULL COMMENT '事件设定时间（系统事件时间）',
      MODIFY COLUMN \`enqueued_at\` timestamp(3) NOT NULL COMMENT '入队时间（系统事件时间）',
      MODIFY COLUMN \`started_at\` timestamp(3) NULL DEFAULT NULL COMMENT '开始执行时间（系统事件时间）',
      MODIFY COLUMN \`finished_at\` timestamp(3) NULL DEFAULT NULL COMMENT '完成时间（系统事件时间）',
      MODIFY COLUMN \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
      MODIFY COLUMN \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`base_async_task_records\`
      MODIFY COLUMN \`occurred_at\` timestamp NULL DEFAULT NULL COMMENT '事件设定时间',
      MODIFY COLUMN \`enqueued_at\` timestamp NOT NULL COMMENT '入队时间',
      MODIFY COLUMN \`started_at\` timestamp NULL DEFAULT NULL COMMENT '开始执行时间',
      MODIFY COLUMN \`finished_at\` timestamp NULL DEFAULT NULL COMMENT '完成时间',
      MODIFY COLUMN \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      MODIFY COLUMN \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
    `);
  }
}
