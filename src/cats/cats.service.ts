import { Injectable } from '@nestjs/common';
// import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CreateCatInput } from './dto/create-cat.input';
import { UpdateCatInput } from './dto/update-cat.input';
import { Cat } from './entities/cat.entity';

@Injectable()
export class CatsService {
  // constructor(
  //   @InjectPinoLogger(CatsService.name)
  //   private readonly logger: PinoLogger,
  // ) {}

  create(_createCatInput: CreateCatInput) {
    return 'This action adds a new cat';
  }

  /**
   * 获取所有 Cat 数据
   * @returns Cat 数组
   */
  findAll(): Cat[] {
    // this.logger.info('正在获取所有 Cat 数据');
    const cats = [{ exampleField: 1 }, { exampleField: 2 }];
    // this.logger.info(`成功获取 ${cats.length} 条 Cat 数据`);
    return cats;
  }

  /**
   * 根据 ID 获取单个 Cat 数据
   * @param id Cat ID
   * @returns Cat 对象
   */
  findOne(id: number): Cat {
    // this.logger.info(`正在获取 ID 为 ${id} 的 Cat 数据`);
    const cat = { exampleField: id };
    // this.logger.info(`成功获取 Cat 数据: ${JSON.stringify(cat)}`);
    return cat;
  }

  update(id: number, _updateCatInput: UpdateCatInput) {
    return `This action updates a #${id} cat`;
  }

  remove(id: number) {
    return `This action removes a #${id} cat`;
  }
}
