// src/cats/cats.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { errorLog } from '../utils/logger/templates'; // 导入错误日志模板函数
import { CatsArgs } from './dto/cats.args';
import { CreateCatInput } from './dto/create-cat.input';
import { UpdateCatDataInput } from './dto/update-cat.input';
import { Cat } from './entities/cat.entity';

@Injectable()
export class CatsService {
  constructor(
    @InjectPinoLogger('CatsService')
    private readonly logger: PinoLogger,
    @InjectRepository(Cat)
    private readonly catRepository: Repository<Cat>,
  ) {}

  /**
   * 创建新的 Cat
   */
  /**
   * 创建新的 Cat
   */
  async create(createCatInput: CreateCatInput): Promise<Cat> {
    this.logger.info('正在创建新的 Cat', { createCatInput });

    try {
      // 创建 Cat 实体
      const cat = this.catRepository.create({
        name: createCatInput.name,
        status: createCatInput.status,
      });

      // 保存到数据库
      const savedCat = await this.catRepository.save(cat);

      this.logger.info('成功创建 Cat', { id: savedCat.id, name: savedCat.name });
      return savedCat;
    } catch (error: unknown) {
      // 安全地获取错误信息，避免 TypeScript 类型错误
      const errorMessage =
        error instanceof Error
          ? error.message // 如果是 Error 实例，安全地访问 message 属性
          : String(error); // 如果不是，将其转换为字符串

      // 使用模板体系记录错误日志，传入 logger 实例
      errorLog(this.logger, '创建 Cat 失败', {
        error: errorMessage, // 使用处理后的错误信息
        createCatInput,
      });

      // 重新抛出原始错误，保持错误传播链
      // 这样上层调用者可以继续处理这个错误
      throw error;
    }
  }

  /**
   * 获取所有 Cat 数据（简单版本）
   */
  async findAll(): Promise<Cat[]> {
    this.logger.info('正在获取所有 Cat 数据');
    const cats = await this.catRepository.find({
      order: { createdAt: 'DESC' },
    });
    this.logger.info(`成功获取 ${cats.length} 条 Cat 数据`);
    return cats;
  }

  /**
   * 根据条件查询 Cat 列表（分页）
   */
  async findMany(args: CatsArgs): Promise<Cat[]> {
    const queryBuilder = this.buildQueryBuilder(args);

    // 在 Service 中计算 offset
    const offset = (args.page - 1) * args.limit;

    const cats = await queryBuilder.skip(offset).take(args.limit).getMany();
    return cats;
  }

  /**
   * 获取有效的排序字段
   */
  private getValidSortBy(sortBy: string): string {
    const allowedFields = ['id', 'name', 'status', 'createdAt', 'updatedAt'];
    return allowedFields.includes(sortBy) ? sortBy : 'createdAt';
  }

  /**
   * 构建查询构建器（用于数据查询，包含排序）
   */
  private buildQueryBuilder(args: CatsArgs): SelectQueryBuilder<Cat> {
    const queryBuilder = this.buildCountQueryBuilder(args);

    // 添加排序
    const validSortBy = this.getValidSortBy(args.sortBy);
    queryBuilder.orderBy(`cat.${validSortBy}`, args.sortOrder);

    return queryBuilder;
  }

  /**
   * 根据条件统计 Cat 总数
   */
  async countMany(args: CatsArgs): Promise<number> {
    // 使用专门的计数查询构建器，不包含分页参数
    const queryBuilder = this.buildCountQueryBuilder(args);
    const total = await queryBuilder.getCount();

    this.logger.info(`统计结果：${total} 条`);
    return total;
  }

  /**
   * 根据 ID 查询单个 Cat
   */
  async findOne(id: number): Promise<Cat> {
    this.logger.info(`查询 Cat，ID: ${id}`);

    const cat = await this.catRepository.findOne({ where: { id } });

    if (!cat) {
      this.logger.error(`Cat ID: ${id} 不存在`, { catId: id });
      throw new NotFoundException(`ID 为 ${id} 的 Cat 不存在`);
    }

    return cat;
  }

  /**
   * 更新 Cat 数据
   */
  /**
   * 更新 Cat（多参数风格）
   * @param id Cat 的 ID
   * @param updateData 要更新的数据（不包含 ID）
   */
  async update(id: number, updateData: UpdateCatDataInput): Promise<Cat> {
    this.logger.info(`开始更新 Cat，ID: ${id}`, { updateData });

    const existingCat = await this.catRepository.findOne({ where: { id } });

    if (!existingCat) {
      this.logger.error(`Cat 不存在，无法更新`, {
        catId: id,
        requestedUpdate: updateData,
      });
      throw new NotFoundException(`ID 为 ${id} 的 Cat 不存在，无法进行更新操作`);
    }

    Object.assign(existingCat, updateData);
    const updatedCat = await this.catRepository.save(existingCat);

    this.logger.info(`Cat 更新成功`, {
      catId: id,
      updatedCat,
    });

    return updatedCat;
  }

  /**
   * 构建计数查询构建器（不包含分页和排序）
   */
  private buildCountQueryBuilder(args: CatsArgs): SelectQueryBuilder<Cat> {
    const queryBuilder = this.catRepository.createQueryBuilder('cat');

    // 只应用筛选条件，不包含排序和分页
    if (args.name) {
      queryBuilder.andWhere('cat.name ILIKE :name', { name: `%${args.name}%` });
    }

    if (args.status) {
      queryBuilder.andWhere('cat.status = :status', { status: args.status });
    }

    if (args.statuses && args.statuses.length > 0) {
      queryBuilder.andWhere('cat.status IN (:...statuses)', { statuses: args.statuses });
    }

    if (args.createdAfter) {
      queryBuilder.andWhere('cat.createdAt >= :createdAfter', { createdAfter: args.createdAfter });
    }
    if (args.createdBefore) {
      queryBuilder.andWhere('cat.createdAt <= :createdBefore', {
        createdBefore: args.createdBefore,
      });
    }

    return queryBuilder;
  }
}
