// src/cats/cats.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { CreateCatInput } from './dto/create-cat.input';
import { UpdateCatInput } from './dto/update-cat.input';
import { Cat } from './entities/cat.entity';

@Injectable()
export class CatsService {
  /**
   * CatsService 构造函数
   * 通过依赖注入的方式注册和初始化 PinoLogger
   */
  constructor(
    // @InjectPinoLogger 装饰器：告诉 NestJS 依赖注入系统
    // 需要注入一个特定名称的 PinoLogger 实例
    // CatsService.name 作为 logger 的标识符，用于区分不同服务的 logger
    @InjectPinoLogger('CatsService')
    // 声明一个私有只读属性 logger，类型为 PinoLogger
    // private：只能在当前类内部访问
    // readonly：初始化后不能修改
    private readonly logger: PinoLogger,
    @InjectRepository(Cat)
    private readonly catRepository: Repository<Cat>,
  ) {}

  create(_createCatInput: CreateCatInput) {
    return 'This action adds a new cat';
  }

  /**
   * 获取所有 Cat 数据
   * @returns Cat 数组
   */
  // findAll(): Cat[] {
  //   this.logger.info('正在获取所有 Cat 数据');
  //   const cats = [
  //     { id: 1, exampleField: 1, name: '喵喵' },
  //     { id: 2, exampleField: 2, name: '瓜瓜' },
  //   ];
  //   this.logger.info(`成功获取 ${cats.length} 条 Cat 数据`);
  //   return cats;
  // }

  /**
   * 根据 ID 获取单个 Cat 数据
   * @param id Cat ID
   * @returns Cat 对象
   * @throws {NotFoundException} 当找不到对应 ID 的 Cat 时
   */
  async findOne(id: number): Promise<Cat> {
    this.logger.info(`正在获取 ID 为 ${id} 的 Cat 数据`);

    const cat = await this.catRepository.findOne({ where: { id } });

    if (!cat) {
      this.logger.error(`Cat 不存在`, { catId: id });
      throw new NotFoundException(`ID 为 ${id} 的 Cat 不存在`);
    }

    this.logger.info('成功获取 Cat 数据', { cat });
    return cat;
  }

  /**
   * 更新 Cat 数据 - 简单的错误抛出示例
   * @param id Cat ID
   * @param updateCatInput 更新数据
   * @returns 更新后的 Cat 对象
   * @throws {NotFoundException} 当找不到对应 ID 的 Cat 时
   */
  async update(id: number, updateCatInput: UpdateCatInput): Promise<Cat> {
    this.logger.info(`开始更新 Cat，ID: ${id}`, { updateData: updateCatInput });

    // 先查找现有的 Cat
    const existingCat = await this.catRepository.findOne({ where: { id } });

    if (!existingCat) {
      this.logger.error(`Cat 不存在，无法更新`, {
        catId: id,
        requestedUpdate: updateCatInput,
      });
      throw new NotFoundException(`ID 为 ${id} 的 Cat 不存在，无法进行更新操作`);
    }

    // 合并更新数据
    Object.assign(existingCat, updateCatInput);

    // 保存更新
    const updatedCat = await this.catRepository.save(existingCat);

    this.logger.info(`Cat 更新成功`, {
      catId: id,
      updatedCat,
    });

    return updatedCat;
  }
}
