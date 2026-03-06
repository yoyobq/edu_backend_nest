// 文件位置：/var/www/backend/src/adapters/api/integration-events/integration-events-adapter.module.ts
import { Module } from '@nestjs/common';
import { IntegrationEventsUsecasesModule } from '@src/usecases/integration-events/integration-events-usecases.module';

@Module({
  imports: [IntegrationEventsUsecasesModule],
  exports: [IntegrationEventsUsecasesModule],
})
export class IntegrationEventsAdapterModule {}
