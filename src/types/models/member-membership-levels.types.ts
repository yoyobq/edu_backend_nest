// src/types/models/member-membership-levels.types.ts
/**
 * 会员等级扩展权益（ JSON 字段的类型定义 ）
 * 为避免 TypeORM DeepPartial 类型冲突，使用宽松结构定义。
 * 可约定常见键：discountPercent / monthlyCouponsLimit / note
 */
export type MembershipBenefits = Record<string, unknown>;
