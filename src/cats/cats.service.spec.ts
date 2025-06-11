// src/cats/cats.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { createLoggerMock, getLoggerMock } from '../utils/test/logger-mock';
import { CatsService } from './cats.service';

describe('CatsService', () => {
  let service: CatsService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [CatsService, createLoggerMock('CatsService')],
    }).compile();

    service = module.get<CatsService>(CatsService);
  });

  it('应该被正确定义', () => {
    expect(service).toBeDefined();
  });

  it('查找所有 Cats 时应该记录日志', () => {
    const loggerMock = getLoggerMock(module, 'CatsService');
    service.findAll();
    // 这是处理 Jest mock 方法的标准做法，因为 toHaveBeenCalledWith 是 Jest 提供的方法，不会有 this 绑定问题
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(loggerMock.info).toHaveBeenCalledWith('正在获取所有 Cat 数据');
  });
});
