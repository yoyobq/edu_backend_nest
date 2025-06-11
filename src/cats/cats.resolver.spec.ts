// src/cats/cats.resolver.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { createLoggerMock } from '../utils/test/logger-mock';
import { CatsResolver } from './cats.resolver';
import { CatsService } from './cats.service';

describe('CatsResolver', () => {
  let resolver: CatsResolver;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [CatsResolver, CatsService, createLoggerMock('CatsService')],
    }).compile();

    resolver = module.get<CatsResolver>(CatsResolver);
  });

  it('应该被正确定义', () => {
    expect(resolver).toBeDefined();
  });
});
