import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignBaseThirdPartyAuthTimeFields1773926400000 implements MigrationInterface {
  name = 'AlignBaseThirdPartyAuthTimeFields1773926400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`base_third_party_auth\`
      MODIFY COLUMN \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
      MODIFY COLUMN \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`base_third_party_auth\`
      MODIFY COLUMN \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      MODIFY COLUMN \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
    `);
  }
}
