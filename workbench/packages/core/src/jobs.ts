import type { Job, VisualHyperProject } from "./model.js";

export function upsertProjectJob(project: VisualHyperProject, job: Job): VisualHyperProject {
  const index = project.jobs.findIndex((item) => item.id === job.id);
  const jobs = [...project.jobs];
  if (index >= 0) jobs[index] = job;
  else jobs.push(job);
  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    jobs,
  };
}

export function interruptRunningJobs(project: VisualHyperProject): VisualHyperProject {
  let changed = false;
  const now = new Date().toISOString();
  const jobs = project.jobs.map((job) => {
    if (job.status !== "queued" && job.status !== "running") return job;
    changed = true;
    return {
      ...job,
      status: "interrupted" as const,
      finishedAt: now,
      message: "Kanvis 服务在任务完成前停止，任务未自动重试。",
      error: {
        code: "JOB_INTERRUPTED",
        message: "渲染任务因服务重启而中断。",
        recovery: "确认项目状态后手动重新渲染。",
      },
    };
  });
  return changed ? { ...project, revision: project.revision + 1, updatedAt: now, jobs } : project;
}
