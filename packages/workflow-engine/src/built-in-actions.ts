export const BUILT_IN_ACTION_IDS = [
  "knowledge.consult",
  "knowledge.propose",
] as const;
export type BuiltInActionId = (typeof BUILT_IN_ACTION_IDS)[number];
