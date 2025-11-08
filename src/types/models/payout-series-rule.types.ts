// src/types/models/payout-series-rule.types.ts

/**
 * 课酬规则定义（ JSON ）类型
 * 示例：
 * {
 *   "base": 100,
 *   "factors": {
 *     "venue_type": 1.0,
 *     "coach_level": 1.3,
 *     "course_type": 1.2
 *   },
 *   "explain": "基础价 + 基础价 * ((场地系数 - 1) + (教练等级系数 - 1) + (课程类型系数 - 1))"
 * }
 */
export type PayoutRuleJson = {
  base: number;
  factors: Record<string, number>;
  explain: string;
};
