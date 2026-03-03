import { Injectable } from '@nestjs/common';
import {
  VerificationReadService,
  VerificationRecordDetailView,
  VerificationRecordView,
} from '../services/verification-read.service';
import { VerificationRecordEntity } from '../verification-record.entity';

export type { VerificationRecordDetailView, VerificationRecordView };

@Injectable()
export class VerificationRecordQueryService {
  constructor(private readonly verificationReadService: VerificationReadService) {}

  toCleanView(record: VerificationRecordEntity): VerificationRecordView {
    return this.verificationReadService.toCleanView(record);
  }

  toDetailView(record: VerificationRecordEntity): VerificationRecordDetailView {
    return this.verificationReadService.toDetailView(record);
  }
}
