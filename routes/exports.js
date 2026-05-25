const express = require("express");
const { authMiddleware, getUserId } = require("../middleware/auth");
const { exportQueue } = require("../utils/export-queue");

const router = express.Router();

function getAuthorizedJob(req, res) {
  const job = exportQueue.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ success: false, error: "Export job not found." });
    return null;
  }

  if (String(job.ownerId) !== String(getUserId(req))) {
    res.status(404).json({ success: false, error: "Export job not found." });
    return null;
  }

  return job;
}

function safeAttachmentName(value) {
  return (
    String(value || "export")
      .replace(/[\r\n"]/g, "")
      .trim() || "export"
  );
}

router.get("/exports/:jobId", authMiddleware, (req, res) => {
  const job = getAuthorizedJob(req, res);
  if (!job) {
    return;
  }

  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    export_job: exportQueue.serialize(job),
  });
});

router.get("/exports/:jobId/download", authMiddleware, (req, res) => {
  const job = getAuthorizedJob(req, res);
  if (!job) {
    return;
  }

  res.set("Cache-Control", "no-store");

  if (job.status === "queued" || job.status === "running") {
    return res.status(202).json({
      success: true,
      export_job: exportQueue.serialize(job),
    });
  }

  if (job.status === "failed") {
    return res.status(500).json({
      success: false,
      error: job.error || "Export failed.",
    });
  }

  if (!job.result?.buffer) {
    return res.status(404).json({
      success: false,
      error: "Export file is no longer available.",
    });
  }

  const filename = safeAttachmentName(job.result.filename);
  res.setHeader("Content-Type", job.result.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(job.result.buffer);
});

module.exports = router;
