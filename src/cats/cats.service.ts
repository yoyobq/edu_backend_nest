import { Injectable } from '@nestjs/common';
import { CreateCatInput } from './dto/create-cat.input';
import { UpdateCatInput } from './dto/update-cat.input';
import { Cat } from './entities/cat.entity';

@Injectable()
export class CatsService {
  create(_createCatInput: CreateCatInput) {
    return 'This action adds a new cat';
  }

  findAll(): Cat[] {
    return [{ exampleField: 1 }, { exampleField: 2 }];
  }

  findOne(id: number): Cat {
    return { exampleField: id };
  }

  update(id: number, _updateCatInput: UpdateCatInput) {
    return `This action updates a #${id} cat`;
  }

  remove(id: number) {
    return `This action removes a #${id} cat`;
  }
}
