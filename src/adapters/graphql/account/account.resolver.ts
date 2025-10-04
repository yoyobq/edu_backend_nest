// src/adapters/graphql/account/account.resolver.ts
import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AccountArgs } from '@src/adapters/graphql/account/dto/account.args';
import {
  ResetPasswordInput,
  ResetPasswordResult,
} from '@src/adapters/graphql/account/dto/reset-password.dto';
import { UserAccountDTO } from '@src/adapters/graphql/account/dto/user-account.dto';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { ConsumeVerificationFlowUsecase } from '@src/usecases/verification/consume-verification-flow.usecase';

/**
 * 账户 GraphQL 解析器
 */
@Resolver()
export class AccountResolver {
  constructor(
    private readonly accountService: AccountService,
    private readonly consumeVerificationFlowUsecase: ConsumeVerificationFlowUsecase,
  ) {}

  /**
   * 根据 ID 查询单个账户详细信息
   * @param args 查询参数
   * @param _user 当前登录用户信息（暂未使用，但保留用于未来权限控制）
   * @returns 账户详细信息
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => UserAccountDTO, { description: '根据 ID 查询账户详细信息' })
  async account(
    @Args() args: AccountArgs,
    @currentUser() _user: JwtPayload,
  ): Promise<UserAccountDTO> {
    // 可以添加权限检查：用户只能查看自己的账户信息
    // if (args.id !== _user.sub) {
    //   throw new ForbiddenException('只能查看自己的账户信息');
    // }
    return await this.accountService.getAccountById(args.id);
  }

  /**
   * 重置密码
   * 消费密码重置验证记录并更新账号密码
   */
  @Mutation(() => ResetPasswordResult)
  async resetPassword(@Args('input') input: ResetPasswordInput): Promise<ResetPasswordResult> {
    try {
      const result = await this.consumeVerificationFlowUsecase.execute({
        token: input.token,
        expectedType: VerificationRecordType.PASSWORD_RESET,
        resetPassword: { newPassword: input.newPassword }, // ← 新增透传新密码
      });

      // 检查是否为密码重置成功结果
      if ('success' in result && result.success) {
        return {
          success: true,
          message: '密码重置成功',
          accountId: result.accountId,
        };
      }

      return {
        success: false,
        message: '密码重置失败：未知错误',
      };
    } catch (error) {
      return {
        success: false,
        message: `密码重置失败：${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }
}
