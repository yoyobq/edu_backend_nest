// modules/account/account.module.ts
import { Module } from '@nestjs/common';
import { AccountStaffService } from './account-staff/account-staff.service';
import { AccountStudentService } from './account-student/account-student.service';
import { AccountResolver } from './account.resolver';
import { AccountService } from './account.service';
import { UserInfoService } from './user-info/user-info.service';

// 如果你在用 TypeORM：
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffEntity } from './entities/account-staff.entity';
import { StudentEntity } from './entities/account-student.entity';
import { AccountEntity } from './entities/account.entity';
import { UserInfoEntity } from './entities/user-info.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity, UserInfoEntity, StudentEntity, StaffEntity])],
  providers: [
    AccountResolver,
    AccountService,
    AccountStudentService,
    AccountStaffService,
    UserInfoService,
  ],
  exports: [AccountService], // 如果其他模块也会用到
})
export class AccountModule {}
