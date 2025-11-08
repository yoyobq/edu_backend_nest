// src/modules/member-membership-levels/member-membership-levels.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemberMembershipLevelEntity } from './member-membership-level.entity';

/**
 * 会员等级服务
 * 提供会员等级的基础读写能力（供 usecases 编排复用）
 */
@Injectable()
export class MemberMembershipLevelsService {
  constructor(
    @InjectRepository(MemberMembershipLevelEntity)
    private readonly levelRepository: Repository<MemberMembershipLevelEntity>,
  ) {}

  /**
   * 按 ID 查询会员等级
   * @param id 等级 ID
   */
  async findById(id: number): Promise<MemberMembershipLevelEntity | null> {
    return this.levelRepository.findOne({ where: { id } });
  }

  /**
   * 按唯一代码查询会员等级
   * @param code 等级代码
   */
  async findByCode(code: string): Promise<MemberMembershipLevelEntity | null> {
    return this.levelRepository.findOne({ where: { code } });
  }

  /**
   * 创建会员等级
   * @param data 创建数据
   */
  async create(data: {
    code: string;
    name: string;
    benefits?: MemberMembershipLevelEntity['benefits'];
  }): Promise<MemberMembershipLevelEntity> {
    const entity = this.levelRepository.create({
      code: data.code,
      name: data.name,
      benefits: data.benefits ?? null,
    });
    return this.levelRepository.save(entity);
  }

  /**
   * 更新会员等级基本信息
   * @param id 等级 ID
   * @param patch 部分更新数据
   */
  async update(
    id: number,
    patch: Partial<Pick<MemberMembershipLevelEntity, 'name' | 'benefits'>>,
  ): Promise<MemberMembershipLevelEntity> {
    const existing = await this.levelRepository.findOne({ where: { id } });
    if (!existing) throw new Error('更新前的会员等级未找到');
    if (typeof patch.name !== 'undefined') existing.name = patch.name;
    if (typeof patch.benefits !== 'undefined') existing.benefits = patch.benefits ?? null;
    const saved = await this.levelRepository.save(existing);
    return saved;
  }
}
