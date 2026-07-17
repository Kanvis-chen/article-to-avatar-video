import { describe, expect, it } from "vitest";
import type { StyleSkillSummary } from "@visualhyper/core";
import { styleSkillsUrl } from "./api";
import { validateStyleSkillValues } from "./styleSkillUi";

const skill: StyleSkillSummary = {
  id: "demo", workflowId: "workflow-demo", name: "测试风格", description: "demo", version: "1.0.0",
  materialTypes: ["footage"], source: "project", sourceLabel: "当前项目",
  availability: { available: true, code: "ready", message: "可以使用" },
  inputs: [{ id: "brief", type: "text", label: "内容", required: true, multiline: true, maxLength: 10 }],
};

describe("style skill UI contract", () => {
  it("builds the creator-facing library endpoint", () => {
    expect(styleSkillsUrl()).toBe("/api/style-skills");
    expect(styleSkillsUrl("footage")).toBe("/api/style-skills?materialType=footage");
  });
  it("validates summary inputs without a raw workflow manifest", () => {
    expect(validateStyleSkillValues(skill, {})).toEqual(["内容为必填项。"]);
    expect(validateStyleSkillValues(skill, { brief: "可以" })).toEqual([]);
  });
});
