import Database from "better-sqlite3";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { nanoid } from "nanoid";

const DB_PATH = process.env.ARCHIVE_JOBS_DB || "./archive-jobs.db";

let db = null;

const getDb = () => {
    if (db) return db;

    // Ensure directory exists
    const dbDir = dirname(DB_PATH);
    try {
        mkdirSync(dbDir, { recursive: true });
    } catch {
        // Directory might already exist
    }

    db = new Database(DB_PATH);
    
    // Enable WAL mode for better performance
    db.pragma("journal_mode = WAL");
    
    // Create table if not exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            type TEXT NOT NULL DEFAULT 'single',
            state TEXT NOT NULL DEFAULT 'queued',
            request TEXT NOT NULL,
            service TEXT,
            filename TEXT,
            resolved TEXT,
            bytes_downloaded INTEGER DEFAULT 0,
            bytes_total INTEGER,
            progress_percent INTEGER DEFAULT 0,
            archive_entry_id TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_jobs_parent ON jobs(parent_id);
        CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
        CREATE INDEX IF NOT EXISTS idx_jobs_service ON jobs(service);
        CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
    `);

    return db;
};

const rowToJob = (row) => {
    if (!row) return null;
    return {
        id: row.id,
        parentId: row.parent_id,
        type: row.type,
        state: row.state,
        request: JSON.parse(row.request),
        service: row.service,
        filename: row.filename,
        resolved: row.resolved ? JSON.parse(row.resolved) : null,
        progress: {
            bytesDownloaded: row.bytes_downloaded,
            bytesTotal: row.bytes_total,
            percent: row.progress_percent,
        },
        archiveEntryId: row.archive_entry_id,
        error: row.error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
};

// Dynamically import broadcast to avoid circular dependency
let broadcastModule = null;
const getBroadcast = async () => {
    if (!broadcastModule) {
        broadcastModule = await import("../routes/jobs.js");
    }
    return broadcastModule.broadcastJobUpdate;
};

export const createJob = async (jobData) => {
    const database = getDb();
    const now = new Date().toISOString();
    
    const job = {
        id: nanoid(12),
        parent_id: jobData.parentId || null,
        type: jobData.type || "single",
        state: "queued",
        request: JSON.stringify(jobData.request || {}),
        service: jobData.service || null,
        filename: jobData.filename || null,
        resolved: jobData.resolved ? JSON.stringify(jobData.resolved) : null,
        bytes_downloaded: 0,
        bytes_total: null,
        progress_percent: 0,
        archive_entry_id: null,
        error: null,
        created_at: now,
        updated_at: now,
    };

    const stmt = database.prepare(`
        INSERT INTO jobs (
            id, parent_id, type, state, request, service, filename, resolved,
            bytes_downloaded, bytes_total, progress_percent, archive_entry_id, error,
            created_at, updated_at
        ) VALUES (
            @id, @parent_id, @type, @state, @request, @service, @filename, @resolved,
            @bytes_downloaded, @bytes_total, @progress_percent, @archive_entry_id, @error,
            @created_at, @updated_at
        )
    `);

    stmt.run(job);

    return rowToJob(job);
};

export const getJob = async (id) => {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM jobs WHERE id = ?");
    const row = stmt.get(id);
    return rowToJob(row);
};

export const getJobs = async (options = {}) => {
    const database = getDb();
    
    let whereClause = "WHERE 1=1";
    const params = [];

    if (options.parentId !== undefined) {
        if (options.parentId === null) {
            whereClause += " AND parent_id IS NULL";
        } else {
            whereClause += " AND parent_id = ?";
            params.push(options.parentId);
        }
    }

    if (options.state) {
        whereClause += " AND state = ?";
        params.push(options.state);
    }

    if (options.service) {
        whereClause += " AND service = ?";
        params.push(options.service);
    }

    // Get total count
    const countStmt = database.prepare(`SELECT COUNT(*) as count FROM jobs ${whereClause}`);
    const { count: total } = countStmt.get(...params);

    // Get paginated results
    const limit = Math.min(options.limit || 50, 100);
    const cursor = options.cursor || 0;

    const stmt = database.prepare(`
        SELECT * FROM jobs 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(...params, limit, cursor);

    return {
        jobs: rows.map(rowToJob),
        total,
        cursor,
        hasMore: cursor + limit < total,
    };
};

export const updateJob = async (id, updates) => {
    const database = getDb();
    const now = new Date().toISOString();

    const setClause = [];
    const params = [];

    if (updates.state !== undefined) {
        setClause.push("state = ?");
        params.push(updates.state);
    }
    if (updates.progress !== undefined) {
        setClause.push("bytes_downloaded = ?, bytes_total = ?, progress_percent = ?");
        params.push(
            updates.progress.bytesDownloaded,
            updates.progress.bytesTotal,
            updates.progress.percent
        );
    }
    if (updates.archiveEntryId !== undefined) {
        setClause.push("archive_entry_id = ?");
        params.push(updates.archiveEntryId);
    }
    if (updates.error !== undefined) {
        setClause.push("error = ?");
        params.push(updates.error);
    }

    setClause.push("updated_at = ?");
    params.push(now);
    params.push(id);

    const stmt = database.prepare(`
        UPDATE jobs 
        SET ${setClause.join(", ")}
        WHERE id = ?
    `);

    stmt.run(...params);

    return getJob(id);
};

export const setJobRunning = async (id) => {
    const job = await updateJob(id, { state: "running" });
    const broadcast = await getBroadcast();
    if (broadcast) broadcast(job);
    return job;
};

export const setJobProgress = async (id, bytesDownloaded, bytesTotal) => {
    const safeDownloaded = Math.max(0, Number(bytesDownloaded) || 0);
    const safeTotal = Number.isFinite(bytesTotal) && bytesTotal > 0 ? Number(bytesTotal) : null;

    let percent = 0;
    if (safeTotal) {
        percent = Math.round((safeDownloaded / safeTotal) * 100);
    }

    percent = Math.max(0, Math.min(100, percent));

    const job = await updateJob(id, {
        progress: { bytesDownloaded: safeDownloaded, bytesTotal: safeTotal, percent },
    });
    const broadcast = await getBroadcast();
    if (broadcast) broadcast(job);
    return job;
};

export const setJobDone = async (id, archiveEntryId) => {
    const existing = await getJob(id);
    const total = existing?.progress?.bytesTotal;
    const downloaded = existing?.progress?.bytesDownloaded || 0;

    const job = await updateJob(id, {
        state: "done",
        archiveEntryId,
        progress: {
            bytesDownloaded: total || downloaded,
            bytesTotal: total || downloaded || null,
            percent: 100,
        },
    });
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
    const database = getDb();

    // Delete children first
    database.prepare("DELETE FROM jobs WHERE parent_id = ?").run(id);

    // Delete the job itself
    const result = database.prepare("DELETE FROM jobs WHERE id = ?").run(id);

    return result.changes > 0;
};

export const getChildJobs = async (parentId) => {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM jobs WHERE parent_id = ? ORDER BY created_at ASC");
    const rows = stmt.all(parentId);
    return rows.map(rowToJob);
};

export const getRunningJobs = async () => {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM jobs WHERE state = 'running' ORDER BY created_at ASC");
    const rows = stmt.all();
    return rows.map(rowToJob);
};

export const getQueuedJobs = async () => {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM jobs WHERE state = 'queued' ORDER BY created_at ASC");
    const rows = stmt.all();
    return rows.map(rowToJob);
};

export const claimNextQueuedJob = async () => {
    const database = getDb();
    const now = new Date().toISOString();

    const claim = database.transaction(() => {
        const next = database
            .prepare("SELECT id FROM jobs WHERE state = 'queued' ORDER BY created_at ASC LIMIT 1")
            .get();

        if (!next?.id) {
            return null;
        }

        const result = database
            .prepare("UPDATE jobs SET state = 'running', updated_at = ? WHERE id = ? AND state = 'queued'")
            .run(now, next.id);

        if (result.changes === 0) {
            return null;
        }

        return database.prepare("SELECT * FROM jobs WHERE id = ?").get(next.id);
    });

    const claimed = rowToJob(claim());

    if (claimed) {
        const broadcast = await getBroadcast();
        if (broadcast) {
            broadcast(claimed);
        }
    }

    return claimed;
};

export const recoverRunningJobs = async () => {
    const database = getDb();
    
    const result = database.prepare(`
        UPDATE jobs 
        SET state = 'queued', updated_at = ?
        WHERE state = 'running'
    `).run(new Date().toISOString());

    return result.changes;
};

export const forceFlush = async () => {
    const database = getDb();
    database.checkpoint();
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
    claimNextQueuedJob,
    recoverRunningJobs,
    forceFlush,
};
