// 文件位置：src/usecases/membership-levels/list-membership-levels.usecase.ts
import { Injectable } from '@nestjs/common';
import { MembershipLevelEntity } from '@src/modules/membership-levels/membership-level.entity';
import { MembershipLevelsService } from '@src/modules/membership-levels/membership-levels.service';

export interface ListMembershipLevelsOutput {
  readonly levels: ReadonlyArray<Pick<MembershipLevelEntity, 'id' | 'code' | 'name' | 'benefits'>>;
}

/**
 * 用例：列出全部会员等级（供前端下拉或多选）
 * 纯读用例，薄编排，不做业务规则。
 */
@Injectable()
export class ListMembershipLevelsUsecase {
  constructor(private readonly levelsService: MembershipLevelsService) {}

  /**
   * 执行列表读取
   */
  async execute(): Promise<ListMembershipLevelsOutput> {
    const all = await this.levelsService.findAll();
    return {
      levels: all.map((l) => ({ id: l.id, code: l.code, name: l.name, benefits: l.benefits })),
    };
  }
}
