/**
 * Shared shapes for agent trace and governance state.
 *
 * These types belong to `src/state/hudReducer.ts` (Task 3 of the plan),
 * which does not exist yet — Tasks 11/12 are being executed ahead of it.
 * They are declared here verbatim so components can depend on the final
 * shape without a stub reducer. When Task 3 lands, `hudReducer.ts` should
 * re-export these rather than redeclaring them.
 */

export type TraceEntry = { goal: string; event: string; detail: string; step: number | null; at: number };

export type ParkedAction = {
  id: string;
  goal: string;
  action: string;
  detail: string;
  risk: string;
  at: number;
  /** true between tapping ALLOW/DENY and the server confirming */
  resolving: boolean;
};
