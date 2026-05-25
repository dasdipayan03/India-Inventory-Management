const crypto = require("crypto");

const DEFAULT_MAX_JOBS = 80;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFilenameFromDisposition(disposition, fallback = "export") {
  const value = String(disposition || "");
  const encodedMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1]).replace(/[\r\n"]/g, "");
    } catch (_error) {
      return fallback;
    }
  }

  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  return (plainMatch?.[1] || fallback).replace(/[\r\n"]/g, "");
}

class ExportQueue {
  constructor(options = {}) {
    this.maxJobs = readPositiveInt(
      options.maxJobs,
      readPositiveInt(process.env.EXPORT_QUEUE_MAX_JOBS, DEFAULT_MAX_JOBS),
    );
    this.concurrency = readPositiveInt(
      options.concurrency,
      readPositiveInt(
        process.env.EXPORT_QUEUE_CONCURRENCY,
        DEFAULT_CONCURRENCY,
      ),
    );
    this.ttlMs = readPositiveInt(
      options.ttlMs,
      readPositiveInt(process.env.EXPORT_QUEUE_TTL_MS, DEFAULT_TTL_MS),
    );
    this.jobs = new Map();
    this.queue = [];
    this.activeCount = 0;
  }

  enqueue({ ownerId, actorId, requestPath, run }) {
    this.cleanup();

    if (this.jobs.size >= this.maxJobs) {
      const error = new Error(
        "Export queue is busy. Please try again shortly.",
      );
      error.status = 429;
      throw error;
    }

    const now = new Date();
    const job = {
      id: crypto.randomUUID(),
      ownerId: String(ownerId),
      actorId: actorId ? String(actorId) : null,
      requestPath,
      status: "queued",
      createdAt: now,
      startedAt: null,
      completedAt: null,
      expiresAt: new Date(Date.now() + this.ttlMs),
      error: null,
      result: null,
      run,
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.process();
    return this.serialize(job);
  }

  get(jobId) {
    this.cleanup();
    const job = this.jobs.get(String(jobId || ""));
    return job || null;
  }

  serialize(job) {
    return {
      id: job.id,
      status: job.status,
      request_path: job.requestPath,
      filename: job.result?.filename || null,
      content_type: job.result?.contentType || null,
      created_at: job.createdAt.toISOString(),
      started_at: job.startedAt ? job.startedAt.toISOString() : null,
      completed_at: job.completedAt ? job.completedAt.toISOString() : null,
      expires_at: job.expiresAt.toISOString(),
      error: job.error,
    };
  }

  cleanup() {
    const now = Date.now();
    let deleted = 0;
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.expiresAt.getTime() <= now && job.status !== "running") {
        this.jobs.delete(jobId);
        deleted += 1;
      }
    }
    return deleted;
  }

  stats() {
    this.cleanup();
    const byStatus = {};
    for (const job of this.jobs.values()) {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    }

    return {
      jobs: this.jobs.size,
      queued: this.queue.length,
      active: this.activeCount,
      concurrency: this.concurrency,
      max_jobs: this.maxJobs,
      ttl_ms: this.ttlMs,
      by_status: byStatus,
    };
  }

  process() {
    while (this.activeCount < this.concurrency && this.queue.length) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);
      if (!job || job.status !== "queued") {
        continue;
      }

      this.activeCount += 1;
      job.status = "running";
      job.startedAt = new Date();

      Promise.resolve()
        .then(() => job.run())
        .then((result) => {
          job.status = "completed";
          job.result = result;
          job.completedAt = new Date();
          job.expiresAt = new Date(Date.now() + this.ttlMs);
        })
        .catch((error) => {
          job.status = "failed";
          job.error = error?.message || "Export failed";
          job.completedAt = new Date();
          job.expiresAt = new Date(Date.now() + this.ttlMs);
        })
        .finally(() => {
          this.activeCount -= 1;
          this.process();
        });
    }
  }
}

const exportQueue = new ExportQueue();

module.exports = {
  ExportQueue,
  exportQueue,
  parseFilenameFromDisposition,
};
