// src/usecases/membership-levels/get-membership-level-by-id.usecase.ts

import { MembershipLevelEntity } from '@modules/membership-levels/membership-level.entity';
import { MembershipLevelsService } from '@modules/membership-levels/membership-levels.service';
import { Injectable } from '@nestjs/common';

/**
 * 用例：按 ID 读取会员等级信息
 * - 编排对模块服务的读取；不做业务规则，仅提供薄封装
 */
@Injectable()
export class GetMembershipLevelByIdUsecase {
  constructor(private readonly levelsService: MembershipLevelsService) {}

  /**
   * 执行读取会员等级信息
   * @param params 输入参数（等级 ID）
   * @returns 会员等级实体或 null
   */
  async execute(params: { id: number }): Promise<MembershipLevelEntity | null> {
    const { id } = params;
    if (!Number.isInteger(id) || id <= 0) return null;
    return await this.levelsService.findById(id);
  }
}
