import type { StyleSkillSummary, WorkflowInputValues } from "@visualhyper/core";

export function validateStyleSkillValues(skill: StyleSkillSummary, values: WorkflowInputValues): string[] {
  const errors: string[] = [];
  for (const input of skill.inputs) {
    const value = values[input.id];
    const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    if (input.required && empty) errors.push(`${input.label}为必填项。`);
    if (input.type === "text" && typeof value === "string" && value.length > input.maxLength) errors.push(`${input.label}不能超过 ${input.maxLength} 个字符。`);
    if (input.type === "select" && typeof value === "string" && value && !input.options.some((option) => option.value === value)) errors.push(`${input.label}包含无效选项。`);
  }
  return errors;
}
