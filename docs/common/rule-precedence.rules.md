
<!-- file: docs/common/rule-precedence.rules.md -->

Purpose: Define precedence rules for resolving overlaps or conflicts across rule documents.
Read when: Multiple rule documents apply to the same change and guidance is not clearly aligned.
Do not read when: Only one rule document applies and there is no conflict to resolve.
Source of truth: This file defines rule precedence; other rule documents must not override this order
implicitly.

## Rule Precedence

Precedence resolves conflicts only.
If multiple documents apply and their guidance does not conflict, all applicable constraints remain in
force.

1. Layer-boundary rules take precedence.
   If two applicable documents assign different ownership to the same responsibility, follow the
   layer-boundary rule first.

2. Specialized rules override general rules only within their explicitly scoped concern.
   `docs/worker/worker-usecase.rules.md` overrides conflicting parts of `docs/common/usecase.rules.md`
   only for explicitly defined worker-specific execution concerns, such as lifecycle handling, runtime
   input, and retry/failure recording.
   `docs/common/usecase-write-flow-boundaries.rules.md` overrides conflicting parts of
   `docs/common/usecase.rules.md` only for write-flow split and transaction-root boundary concerns in
   non-worker and general usecase orchestration scenarios.
   All other constraints in `docs/common/usecase.rules.md` remain in force.

3. `docs/project-convention/` is a repository-local refinement of `docs/common/`, not a replacement
   for it.
   It may override only repository-specific implementation details in `docs/common/`, such as naming,
   file placement, delivery conventions, and repository workflow constraints.
   It must not redefine layer ownership, dependency direction, or cross-layer responsibility
   boundaries.

4. Type rules govern placement and reuse, not business ownership.
   `docs/common/type.rules.md` decides where types and enums live, but does not redefine adapter,
   usecase, queryservice, or module responsibilities.

5. Supplementary rules are additive by default.
   Files such as `docs/common/modules.extra.rules.md` add recommended practices unless they explicitly
   state that they override another rule.
   Supplementary rules do not override layer-boundary rules unless this precedence section explicitly
   says so.

6. When adapter, usecase, and queryservice concerns intersect, resolve precedence in this order:
   layer boundary -> scoped topic-specific rule -> repository-specific convention

## Rule Resolution Reporting

If `docs/common/rule-precedence.rules.md` is used to resolve an actual rule conflict, scope overlap, or ownership ambiguity, the output must explicitly report:

1. that `docs/common/rule-precedence.rules.md` was used;
2. which applicable documents were in conflict or overlap;
3. which precedence rule was applied;
4. the final resolution decision.

If this document was consulted but no actual conflict or overlap required resolution, no output is required
