// 文件位置: /var/www/backend/src/modules/verification-record/queries/consumable.query.service.ts
import { AudienceTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import {
  VerificationReadService,
  VerificationRecordView,
} from '../services/verification-read.service';

@Injectable()
export class ConsumableQueryService {
  constructor(private readonly verificationReadService: VerificationReadService) {}

  /**
   * 查找可消费的验证记录
   * @param token 验证 token
   * @param audience 受众类型
   * @param email 邮箱
   * @param phone 手机号
   */
  async findConsumableRecord(
    token: string,
    audience?: AudienceTypeEnum | null,
    email?: string | null,
    phone?: string | null,
  ): Promise<VerificationRecordView> {
    return this.verificationReadService.findConsumableRecord(token, audience, email, phone);
  }
}
