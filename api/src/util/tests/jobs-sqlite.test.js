import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

// Set a test database path
process.env.ARCHIVE_JOBS_DB = "./test-archive-jobs.db";

// Clean up any existing test database before starting
try {
    await rm(process.env.ARCHIVE_JOBS_DB);
} catch {
    // File might not exist
}

const {
    createJob,
    getJob,
    getJobs,
    updateJob,
    deleteJob,
    recoverRunningJobs,
    getChildJobs,
} = await import("../../archive/jobs.js");

test("createJob creates a job with correct defaults", async () => {
    const job = await createJob({
        type: "single",
        request: { url: "https://example.com/video" },
        service: "youtube",
        filename: "test_video.mp4",
    });

    assert.ok(job.id);
    assert.equal(job.type, "single");
    assert.equal(job.state, "queued");
    assert.equal(job.service, "youtube");
    assert.equal(job.filename, "test_video.mp4");
    assert.ok(job.createdAt);
    assert.ok(job.progress);
    assert.equal(job.progress.percent, 0);
});

test("getJob retrieves job by id", async () => {
    const created = await createJob({
        type: "single",
        request: { url: "https://example.com/audio" },
    });

    const retrieved = await getJob(created.id);
    assert.ok(retrieved);
    assert.equal(retrieved.id, created.id);
});

test("getJob returns null for non-existent job", async () => {
    const job = await getJob("non-existent-id");
    assert.equal(job, null);
});

test("getJobs returns paginated results", async () => {
    // Create several jobs
    for (let i = 0; i < 5; i++) {
        await createJob({
            type: "single",
            request: { url: `https://example.com/${i}` },
        });
    }

    const result = await getJobs({ limit: 3, cursor: 0 });
    assert.equal(result.jobs.length, 3);
    assert.equal(result.hasMore, true);
});

test("updateJob modifies job fields", async () => {
    const job = await createJob({
        type: "single",
        request: { url: "https://example.com/test" },
    });

    const updated = await updateJob(job.id, { state: "running" });
    assert.equal(updated.state, "running");

    const retrieved = await getJob(job.id);
    assert.equal(retrieved.state, "running");
});

test("deleteJob removes job and children", async () => {
    const parent = await createJob({
        type: "parent",
        request: { url: "https://example.com/album" },
    });

    const child = await createJob({
        parentId: parent.id,
        type: "child",
        request: { url: "https://example.com/track1" },
    });

    const deleted = await deleteJob(parent.id);
    assert.equal(deleted, true);

    const parentRetrieved = await getJob(parent.id);
    assert.equal(parentRetrieved, null);

    const childRetrieved = await getJob(child.id);
    assert.equal(childRetrieved, null);
});

test("recoverRunningJobs resets running jobs to queued", async () => {
    const job = await createJob({
        type: "single",
        request: { url: "https://example.com/interrupted" },
    });

    await updateJob(job.id, { state: "running" });

    const recovered = await recoverRunningJobs();
    assert.ok(recovered >= 1);

    const retrieved = await getJob(job.id);
    assert.equal(retrieved.state, "queued");
});

test("getChildJobs returns children of parent", async () => {
    const parent = await createJob({
        type: "parent",
        request: { url: "https://example.com/playlist" },
    });

    await createJob({
        parentId: parent.id,
        type: "child",
        request: { url: "https://example.com/item1" },
        filename: "item1.mp4",
    });

    await createJob({
        parentId: parent.id,
        type: "child",
        request: { url: "https://example.com/item2" },
        filename: "item2.mp4",
    });

    const children = await getChildJobs(parent.id);
    assert.equal(children.length, 2);
    assert.ok(children.find(c => c.filename === "item1.mp4"));
    assert.ok(children.find(c => c.filename === "item2.mp4"));
});

// Clean up test database after tests
test("cleanup", async () => {
    try {
        await rm(process.env.ARCHIVE_JOBS_DB);
        await rm(`${process.env.ARCHIVE_JOBS_DB}-shm`);
        await rm(`${process.env.ARCHIVE_JOBS_DB}-wal`);
    } catch {
        // Files might not exist
    }
});
