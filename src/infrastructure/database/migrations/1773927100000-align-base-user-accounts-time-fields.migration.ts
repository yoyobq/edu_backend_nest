import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignBaseUserAccountsTimeFields1773927100000 implements MigrationInterface {
  name = 'AlignBaseUserAccountsTimeFields1773927100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`base_user_accounts\`
      MODIFY COLUMN \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
      MODIFY COLUMN \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`base_user_accounts\`
      MODIFY COLUMN \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
      MODIFY COLUMN \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time';
    `);
  }
}
