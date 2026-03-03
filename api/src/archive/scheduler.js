import { env } from "../config.js";
import { fetch } from "undici";
import { pipeline } from "stream/promises";
import { Agent } from "undici";

import {
    getQueuedJobs,
    setJobRunning,
    setJobProgress,
    setJobDone,
    setJobError,
    setJobCanceled,
    createJob,
    getChildJobs,
    getJob,
} from "./jobs.js";
import { archiveStream } from "./writer-sqlite.js";
import { extract } from "../processing/url.js";
import match from "../processing/match.js";
import { getIP } from "../processing/request.js";

const CONCURRENCY = Number(env.archiveJobConcurrency) || 2;
const agent = new Agent();

let running = 0;
let scheduled = false;
let abortControllers = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const startScheduler = async () => {
    if (scheduled) return;
    scheduled = true;

    while (true) {
        if (running >= CONCURRENCY) {
            await sleep(100);
            continue;
        }

        const queued = await getQueuedJobs();

        if (queued.length === 0) {
            await sleep(500);
            continue;
        }

        const job = queued[0];
        running++;
        executeJob(job.id).finally(() => {
            running--;
        });
    }
};

const executeJob = async (jobId) => {
    const job = await setJobRunning(jobId);
    if (!job) return;

    const abortController = new AbortController();
    abortControllers.set(jobId, abortController);

    try {
        const result = await processJobRequest(job, abortController.signal);

        if (result.type === "picker") {
            await handlePickerExpansion(job, result);
            return;
        }

        if (result.type === "redirect" || result.type === "tunnel") {
            await downloadAndArchive(job, result, abortController.signal);
            return;
        }

        throw new Error("Unsupported response type");
    } catch (error) {
        if (abortController.signal.aborted) {
            await setJobCanceled(jobId);
        } else {
            await setJobError(jobId, error?.message || "Job failed");
        }
    } finally {
        abortControllers.delete(jobId);
    }
};

const processJobRequest = async (job, signal) => {
    const request = job.request;

    if (!request.url) {
        throw new Error("Missing URL");
    }

    const parsed = extract(request.url);

    if (!parsed || "error" in parsed) {
        throw new Error(parsed?.error || "Invalid URL");
    }

    const matchResult = await match({
        host: parsed.host,
        patternMatch: parsed.patternMatch,
        params: request,
        authType: "none",
    });

    if (matchResult.status >= 400 || matchResult.body.status === "error") {
        throw new Error(matchResult.body?.error?.code || "Processing failed");
    }

    const body = matchResult.body;

    if (body.status === "picker") {
        return {
            type: "picker",
            picker: body.picker,
            audio: body.audio,
            audioFilename: body.audioFilename,
        };
    }

    if (body.status === "redirect") {
        return {
            type: "redirect",
            url: body.url,
            filename: body.filename,
            headers: {},
        };
    }

    if (body.status === "tunnel") {
        return {
            type: "tunnel",
            url: body.url,
            filename: body.filename,
        };
    }

    throw new Error("Unexpected response status");
};

const handlePickerExpansion = async (parentJob, pickerResult) => {
    const parent = await getJob(parentJob.id);
    if (!parent) return;

    const children = [];

    // Create child jobs for each picker item
    for (let i = 0; i < pickerResult.picker.length; i++) {
        const item = pickerResult.picker[i];
        const child = await createJob({
            parentId: parent.id,
            type: "child",
            request: {
                ...parent.request,
                url: item.url,
                filename: `${parent.filename || "picker"}_${i + 1}`,
            },
            service: parent.service,
            filename: item.filename || `${parent.filename || "picker"}_${i + 1}`,
            resolved: { type: "proxy", url: item.url },
        });
        children.push(child);
    }

    // Create audio child if present
    if (pickerResult.audio) {
        const audioChild = await createJob({
            parentId: parent.id,
            type: "child",
            request: {
                ...parent.request,
                url: pickerResult.audio,
                isAudioOnly: true,
            },
            service: parent.service,
            filename: pickerResult.audioFilename || `${parent.filename || "picker"}_audio`,
            resolved: { type: "audio", url: pickerResult.audio },
        });
        children.push(audioChild);
    }

    // Mark parent as done (it expanded successfully)
    await setJobDone(parent.id, null);
};

const downloadAndArchive = async (job, result, signal) => {
    let url = result.url;
    let filename = result.filename;
    let headers = result.headers || {};

    // For tunnel URLs, we need to resolve them first
    if (result.type === "tunnel") {
        // The tunnel URL is already a full cobalt tunnel URL
        // We need to fetch it server-side
        url = result.url;
    }

    const response = await fetch(url, {
        headers,
        signal,
        dispatcher: agent,
    });

    if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : null;
    let downloadedBytes = 0;

    const mimeType = response.headers.get("content-type") || "application/octet-stream";

    // Create a transforming stream to track progress
    const { Readable } = await import("stream");

    const progressStream = new Readable({
        read() {},
    });

    const originalBody = response.body;
    const reader = originalBody.getReader();

    const trackProgress = async () => {
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    progressStream.push(null);
                    break;
                }
                downloadedBytes += value.length;
                progressStream.push(value);

                if (totalBytes) {
                    await setJobProgress(job.id, downloadedBytes, totalBytes);
                }
            }
        } catch (error) {
            progressStream.destroy(error);
        }
    };

    trackProgress();

    // Archive the stream
    const service = job.service || "unknown";
    const archivedPath = await archiveStream(service, filename, progressStream, mimeType, {
        cover: job.request?.cover,
    });

    if (!archivedPath) {
        throw new Error("Failed to archive file");
    }

    await setJobDone(job.id, null); // archiveEntryId will be set by addToIndex
};

export const cancelJob = async (jobId) => {
    const controller = abortControllers.get(jobId);
    if (controller) {
        controller.abort();
        return true;
    }

    // If not actively running, just mark as canceled
    await setJobCanceled(jobId);
    return true;
};

export const getActiveJobCount = () => running;

export default {
    startScheduler,
    cancelJob,
    getActiveJobCount,
};
