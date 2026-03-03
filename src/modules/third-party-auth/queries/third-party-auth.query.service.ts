import { ThirdPartyAuthView } from '@app-types/models/third-party-auth.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ThirdPartyAuthEntity } from '@src/modules/account/base/entities/third-party-auth.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ThirdPartyAuthQueryService {
  constructor(
    @InjectRepository(ThirdPartyAuthEntity)
    private readonly thirdPartyAuthRepository: Repository<ThirdPartyAuthEntity>,
  ) {}

  async getThirdPartyAuths(accountId: number): Promise<ThirdPartyAuthView[]> {
    const records = await this.thirdPartyAuthRepository.find({
      where: { accountId },
      select: [
        'id',
        'accountId',
        'provider',
        'providerUserId',
        'unionId',
        'createdAt',
        'updatedAt',
      ],
    });
    return records.map((record) => ({
      id: record.id,
      accountId: record.accountId,
      provider: record.provider,
      providerUserId: record.providerUserId,
      unionId: record.unionId ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }

  toView(record: ThirdPartyAuthEntity): ThirdPartyAuthView {
    return {
      id: record.id,
      accountId: record.accountId,
      provider: record.provider,
      providerUserId: record.providerUserId,
      unionId: record.unionId ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
