// src/core/database/database.module.ts

import { FieldEncryptionModule } from '@core/field-encryption/field-encryption.module';
import { FieldEncryptionSubscriber } from '@core/field-encryption/field-encryption.subscriber';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * 数据库配置工厂函数
 * @param config 配置服务实例
 * @param fieldEncryptionSubscriber 字段加密订阅者
 * @returns TypeORM 配置选项
 */
const createDatabaseConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: config.get<'mysql'>('mysql.type'),
  host: config.get<string>('mysql.host'),
  port: config.get<number>('mysql.port'),
  username: config.get<string>('mysql.username'),
  password: config.get<string>('mysql.password'),
  database: config.get<string>('mysql.database'),
  timezone: config.get<string>('mysql.timezone'),
  synchronize: config.get<boolean>('mysql.synchronize'),
  logging: config.get<boolean>('mysql.logging'),
  charset: config.get<string>('mysql.charset'),
  extra: config.get('mysql.extra'),
  // 自动加载 entities
  autoLoadEntities: true,
  // 注册 subscriber
  subscribers: [FieldEncryptionSubscriber],
  // 实体文件路径
  // entities: [__dirname + '/**/*.entity{.ts,.js}'],
});

/**
 * 数据库模块
 * 封装 TypeORM 配置和初始化逻辑
 */
@Module({
  imports: [
    FieldEncryptionModule, // 导入加密模块
    TypeOrmModule.forRootAsync({
      imports: [FieldEncryptionModule], // 确保加密模块在此处可用
      inject: [ConfigService, FieldEncryptionSubscriber],
      useFactory: createDatabaseConfig,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
