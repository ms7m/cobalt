import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { nanoid } from "nanoid";

// Dynamically import broadcast to avoid circular dependency
let broadcastModule = null;
const getBroadcast = async () => {
    if (!broadcastModule) {
        broadcastModule = await import("../routes/jobs.js");
    }
    return broadcastModule.broadcastJobUpdate;
};

const JOBS_PATH = process.env.ARCHIVE_JOBS_PATH || "./archive-jobs.jsonl";
const FLUSH_INTERVAL_MS = 5000;

let jobs = new Map();
let jobsLoaded = false;
let dirty = false;
let flushTimer = null;

const loadJobs = async () => {
    if (jobsLoaded) return;

    try {
        const data = await readFile(JOBS_PATH, "utf8");
        const lines = data.split("\n").filter((line) => line.trim());

        for (const line of lines) {
            try {
                const job = JSON.parse(line);
                if (job.id) {
                    jobs.set(job.id, job);
                }
            } catch {
                // skip corrupted line
            }
        }
    } catch (e) {
        if (e.code !== "ENOENT") {
            console.error("Failed to load archive jobs:", e);
        }
    }

    jobsLoaded = true;
};

const saveJobs = async () => {
    if (!dirty) return;

    try {
        await mkdir(dirname(JOBS_PATH), { recursive: true });
        const lines = Array.from(jobs.values()).map((job) => JSON.stringify(job));
        await writeFile(JOBS_PATH, lines.join("\n") + "\n");
        dirty = false;
    } catch (e) {
        console.error("Failed to save archive jobs:", e);
        throw e;
    }
};

const scheduleFlush = () => {
    dirty = true;
    if (flushTimer) return;

    flushTimer = setTimeout(async () => {
        flushTimer = null;
        await saveJobs();
    }, FLUSH_INTERVAL_MS);
};

export const createJob = async (jobData) => {
    await loadJobs();

    const job = {
        id: nanoid(12),
        parentId: jobData.parentId || null,
        type: jobData.type || "single",
        state: "queued",
        request: jobData.request || {},
        service: jobData.service || null,
        filename: jobData.filename || null,
        resolved: jobData.resolved || null,
        progress: {
            bytesDownloaded: 0,
            bytesTotal: null,
            percent: 0,
        },
        archiveEntryId: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    jobs.set(job.id, job);
    scheduleFlush();

    return job;
};

export const getJob = async (id) => {
    await loadJobs();
    return jobs.get(id) || null;
};

export const getJobs = async (options = {}) => {
    await loadJobs();

    let result = Array.from(jobs.values());

    if (options.parentId !== undefined) {
        result = result.filter((j) => j.parentId === options.parentId);
    }

    if (options.state) {
        result = result.filter((j) => j.state === options.state);
    }

    if (options.service) {
        result = result.filter((j) => j.service === options.service);
    }

    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const limit = options.limit || 50;
    const cursor = options.cursor || 0;

    return {
        jobs: result.slice(cursor, cursor + limit),
        total: result.length,
        cursor,
        hasMore: cursor + limit < result.length,
    };
};

export const updateJob = async (id, updates) => {
    await loadJobs();

    const job = jobs.get(id);
    if (!job) return null;

    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    jobs.set(id, job);
    scheduleFlush();

    return job;
};

export const setJobRunning = async (id) => {
    const job = await updateJob(id, { state: "running" });
    const broadcast = await getBroadcast();
    if (broadcast) broadcast(job);
    return job;
};

export const setJobProgress = async (id, bytesDownloaded, bytesTotal) => {
    const percent = bytesTotal ? Math.round((bytesDownloaded / bytesTotal) * 100) : 0;
    const job = await updateJob(id, {
        progress: { bytesDownloaded, bytesTotal, percent },
    });
    const broadcast = await getBroadcast();
    if (broadcast) broadcast(job);
    return job;
};

export const setJobDone = async (id, archiveEntryId) => {
    const job = await updateJob(id, { state: "done", archiveEntryId });
    const broadcast = await getBroadcast();
    if (broadcast) broadcast(job);
    return job;
};

export const setJobError = async (id, error) => {
    const job = await updateJob(id, { state: "error", error });
    const broadcast = await getBroadcast();
    if (broadcast) broadcast(job);
    return job;
};

export const setJobCanceled = async (id) => {
    const job = await updateJob(id, { state: "canceled" });
    const broadcast = await getBroadcast();
    if (broadcast) broadcast(job);
    return job;
};

export const deleteJob = async (id) => {
    await loadJobs();

    const job = jobs.get(id);
    if (!job) return false;

    // Delete children if parent
    if (job.type === "parent") {
        for (const [jid, j] of jobs) {
            if (j.parentId === id) {
                jobs.delete(jid);
            }
        }
    }

    jobs.delete(id);
    scheduleFlush();

    return true;
};

export const getChildJobs = async (parentId) => {
    await loadJobs();
    return Array.from(jobs.values()).filter((j) => j.parentId === parentId);
};

export const getRunningJobs = async () => {
    await loadJobs();
    return Array.from(jobs.values()).filter((j) => j.state === "running");
};

export const getQueuedJobs = async () => {
    await loadJobs();
    return Array.from(jobs.values()).filter((j) => j.state === "queued");
};

export const recoverRunningJobs = async () => {
    await loadJobs();

    let recovered = 0;
    for (const [id, job] of jobs) {
        if (job.state === "running") {
            jobs.set(id, { ...job, state: "queued" });
            recovered++;
        }
    }

    if (recovered > 0) {
        dirty = true;
        await saveJobs();
    }

    return recovered;
};

export const forceFlush = async () => {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    await saveJobs();
};

export default {
    createJob,
    getJob,
    getJobs,
    updateJob,
    setJobRunning,
    setJobProgress,
    setJobDone,
    setJobError,
    setJobCanceled,
    deleteJob,
    getChildJobs,
    getRunningJobs,
    getQueuedJobs,
    recoverRunningJobs,
    forceFlush,
};
