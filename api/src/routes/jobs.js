import {
    createJob,
    getJob,
    getJobs,
    deleteJob,
    setJobCanceled,
    updateJob,
    recoverRunningJobs,
    forceFlush,
    getChildJobs,
} from "../archive/jobs.js";
import { cancelJob, startScheduler, getActiveJobCount } from "../archive/scheduler.js";
import { env } from "../config.js";

const sseClients = new Map();

const broadcastJobUpdate = (job) => {
    const data = JSON.stringify({ type: "jobUpdate", job });
    for (const [clientId, res] of sseClients) {
        res.write(`data: ${data}\n\n`);
    }
};

export const setupJobRoutes = (app) => {
    // Recover any jobs that were running when API last stopped
    recoverRunningJobs().then((count) => {
        if (count > 0) {
            console.log(`Recovered ${count} running jobs to queued state`);
        }
        startScheduler();
    });

    // Create a new background job
    app.post("/archive/jobs", async (req, res) => {
        try {
            const request = req.body;

            if (!request.url) {
                return res.status(400).json({
                    success: false,
                    error: "URL is required",
                });
            }

            const job = await createJob({
                type: "single",
                request,
                service: request.service || null,
                filename: request.filename || null,
            });

            res.status(201).json({
                success: true,
                job: sanitizeJob(job),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error?.message || "Failed to create job",
            });
        }
    });

    // List jobs with pagination and filters
    app.get("/archive/jobs", async (req, res) => {
        try {
            const options = {
                limit: Math.min(parseInt(req.query.limit) || 50, 100),
                cursor: parseInt(req.query.cursor) || 0,
                state: req.query.state || undefined,
                service: req.query.service || undefined,
                parentId: req.query.parentId === "null" ? null : req.query.parentId || undefined,
            };

            const result = await getJobs(options);

            // Enrich with child jobs for parents
            const enrichedJobs = await Promise.all(
                result.jobs.map(async (job) => {
                    if (job.type === "parent") {
                        const children = await getChildJobs(job.id);
                        return { ...sanitizeJob(job), children: children.map(sanitizeJob) };
                    }
                    return sanitizeJob(job);
                })
            );

            res.json({
                success: true,
                jobs: enrichedJobs,
                total: result.total,
                cursor: result.cursor,
                hasMore: result.hasMore,
                activeCount: getActiveJobCount(),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error?.message || "Failed to list jobs",
            });
        }
    });

    // Get single job details
    app.get("/archive/jobs/:id", async (req, res) => {
        try {
            const job = await getJob(req.params.id);

            if (!job) {
                return res.status(404).json({
                    success: false,
                    error: "Job not found",
                });
            }

            let result = sanitizeJob(job);

            // Include children if this is a parent
            if (job.type === "parent") {
                const children = await getChildJobs(job.id);
                result.children = children.map(sanitizeJob);
            }

            res.json({
                success: true,
                job: result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error?.message || "Failed to get job",
            });
        }
    });

    // Cancel a job
    app.delete("/archive/jobs/:id", async (req, res) => {
        try {
            const { id } = req.params;
            const job = await getJob(id);

            if (!job) {
                return res.status(404).json({
                    success: false,
                    error: "Job not found",
                });
            }

            if (job.state === "done" || job.state === "error" || job.state === "canceled") {
                return res.status(400).json({
                    success: false,
                    error: "Job is already in terminal state",
                });
            }

            // Cancel running job or mark as canceled
            await cancelJob(id);

            // Also cancel all children if parent
            if (job.type === "parent") {
                const children = await getChildJobs(id);
                for (const child of children) {
                    if (["queued", "running"].includes(child.state)) {
                        await cancelJob(child.id);
                    }
                }
            }

            await forceFlush();

            res.json({
                success: true,
                message: "Job canceled",
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error?.message || "Failed to cancel job",
            });
        }
    });

    // Retry a failed job
    app.post("/archive/jobs/:id/retry", async (req, res) => {
        try {
            const { id } = req.params;
            const job = await getJob(id);

            if (!job) {
                return res.status(404).json({
                    success: false,
                    error: "Job not found",
                });
            }

            if (job.state !== "error" && job.state !== "canceled") {
                return res.status(400).json({
                    success: false,
                    error: "Only failed or canceled jobs can be retried",
                });
            }

            // Reset to queued state
            const updated = await updateJob(id, {
                state: "queued",
                error: null,
                progress: { bytesDownloaded: 0, bytesTotal: null, percent: 0 },
            });

            broadcastJobUpdate(updated);

            res.json({
                success: true,
                job: sanitizeJob(updated),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error?.message || "Failed to retry job",
            });
        }
    });

    // SSE endpoint for live job updates
    app.get("/archive/jobs/events", (req, res) => {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const clientId = Math.random().toString(36).substring(7);
        sseClients.set(clientId, res);

        // Send initial heartbeat
        res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

        req.on("close", () => {
            sseClients.delete(clientId);
        });

        // Keep connection alive with periodic heartbeat
        const heartbeat = setInterval(() => {
            if (!sseClients.has(clientId)) {
                clearInterval(heartbeat);
                return;
            }
            res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`);
        }, 30000);
    });
};

const sanitizeJob = (job) => {
    if (!job) return null;
    return {
        id: job.id,
        parentId: job.parentId,
        type: job.type,
        state: job.state,
        service: job.service,
        filename: job.filename,
        progress: job.progress,
        archiveEntryId: job.archiveEntryId,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
};

export default { setupJobRoutes, broadcastJobUpdate };
