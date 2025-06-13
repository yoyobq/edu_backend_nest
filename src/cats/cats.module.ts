import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatsService } from './cats.service';
import { CatsResolver } from './cats.resolver';
import { Cat } from './entities/cat.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cat])],
  providers: [CatsResolver, CatsService],
})
export class CatsModule {}
