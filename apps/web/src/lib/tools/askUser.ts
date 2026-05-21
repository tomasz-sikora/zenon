export const ASK_USER_QUESTION_TYPES = [
  "open",
  "confirm",
  "single_choice",
  "multiple_choice",
] as const;
export const ASK_USER_CONFIRM_OPTIONS = ["Yes", "No"] as const;

export type AskUserQuestionType = (typeof ASK_USER_QUESTION_TYPES)[number];

export function isAskUserQuestionType(value: unknown): value is AskUserQuestionType {
  return typeof value === "string" && ASK_USER_QUESTION_TYPES.includes(value as AskUserQuestionType);
}
