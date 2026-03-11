import { Module } from '@nestjs/common';
import { IntegrationEventsUsecasesModule } from '@src/usecases/integration-events/integration-events-usecases.module';

@Module({
  imports: [IntegrationEventsUsecasesModule],
})
export class IntegrationEventsWorkerAdapterModule {}
