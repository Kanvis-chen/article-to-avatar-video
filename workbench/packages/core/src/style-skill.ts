import { z } from "zod";

import { creationModeSchema, workflowInputSchema } from "./workflow.js";

export const styleSkillSourceSchema = z.enum(["builtin", "project"]);
export type StyleSkillSource = z.infer<typeof styleSkillSourceSchema>;

export const styleSkillAvailabilitySchema = z.object({
  available: z.boolean(),
  code: z.enum(["ready", "skill-missing", "provider-missing", "provider-unconfigured", "processor-missing"]),
  message: z.string(),
}).strict();

/** Safe, read-only view of a registered Workflow for creator-facing Style Skill libraries. */
export const styleSkillSummarySchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  materialTypes: z.array(creationModeSchema).min(1),
  source: styleSkillSourceSchema,
  sourceLabel: z.string(),
  availability: styleSkillAvailabilitySchema,
  inputs: z.array(workflowInputSchema),
}).strict();
export type StyleSkillSummary = z.infer<typeof styleSkillSummarySchema>;
