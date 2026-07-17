import { describe, expect, it } from "vitest";

import { createVisualHyperProject, interruptRunningJobs, upsertProjectJob } from "../src/index.js";

describe("Kanvis jobs", () => {
  it("upserts system jobs without adding undo history", () => {
    const project = createVisualHyperProject();
    const updated = upsertProjectJob(project, { id: "render-1", type: "render", status: "queued", progress: 0, message: "排队" });
    expect(updated.revision).toBe(1);
    expect(updated.jobs).toHaveLength(1);
    expect(updated.history).toHaveLength(0);
  });

  it("marks queued and running jobs interrupted after restart", () => {
    let project = createVisualHyperProject();
    project = upsertProjectJob(project, { id: "render-1", type: "render", status: "running", progress: 0.4, message: "运行" });
    const recovered = interruptRunningJobs(project);
    expect(recovered.jobs[0]?.status).toBe("interrupted");
    expect(recovered.jobs[0]?.error?.code).toBe("JOB_INTERRUPTED");
  });
});
