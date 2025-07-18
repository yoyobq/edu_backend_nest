// src/modules/account/account.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from './entities/account.entity';

/**
 * 账户服务
 */
@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
  ) {}

  // 这里将来可以添加账户相关的业务逻辑
  // 例如：创建账户、更新账户信息、查询账户等
}
