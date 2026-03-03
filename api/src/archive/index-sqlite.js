import Database from "better-sqlite3";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { nanoid } from "nanoid";

const DB_PATH = process.env.ARCHIVE_INDEX_DB || "./archive-index.db";

let db = null;

const getDb = () => {
    if (db) return db;

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
        CREATE TABLE IF NOT EXISTS archive_entries (
            id TEXT PRIMARY KEY,
            service TEXT NOT NULL,
            filename TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            size INTEGER DEFAULT 0,
            mime TEXT DEFAULT 'application/octet-stream',
            kind TEXT DEFAULT 'other',
            thumbnail_mime TEXT,
            thumbnail_data BLOB,
            created_at TEXT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_entries_service ON archive_entries(service);
        CREATE INDEX IF NOT EXISTS idx_entries_created ON archive_entries(created_at DESC);
    `);

    return db;
};

const rowToEntry = (row) => {
    if (!row) return null;
    return {
        id: row.id,
        service: row.service,
        filename: row.filename,
        relativePath: row.relative_path,
        size: row.size,
        mime: row.mime,
        kind: row.kind || 'other',
        hasThumbnail: !!row.thumbnail_data,
        thumbnailMime: row.thumbnail_mime,
        createdAt: row.created_at,
    };
};

export const addToIndex = async (entry) => {
    const database = getDb();
    
    const indexEntry = {
        id: nanoid(12),
        service: entry.service,
        filename: entry.filename,
        relative_path: entry.relativePath,
        size: entry.size || 0,
        mime: entry.mime || 'application/octet-stream',
        kind: entry.kind || 'other',
        thumbnail_mime: null,
        thumbnail_data: null,
        created_at: new Date().toISOString(),
    };

    const stmt = database.prepare(`
        INSERT INTO archive_entries (
            id, service, filename, relative_path, size, mime, kind,
            thumbnail_mime, thumbnail_data, created_at
        ) VALUES (
            @id, @service, @filename, @relative_path, @size, @mime, @kind,
            @thumbnail_mime, @thumbnail_data, @created_at
        )
    `);

    stmt.run(indexEntry);

    return rowToEntry(indexEntry);
};

export const updateIndexEntry = async (id, updates = {}) => {
    const database = getDb();

    const setClause = [];
    const params = { id };

    if (updates.thumbnailData !== undefined) {
        setClause.push("thumbnail_data = @thumbnail_data");
        params.thumbnail_data = updates.thumbnailData;
    }
    if (updates.thumbnailMime !== undefined) {
        setClause.push("thumbnail_mime = @thumbnail_mime");
        params.thumbnail_mime = updates.thumbnailMime;
    }
    if (updates.kind !== undefined) {
        setClause.push("kind = @kind");
        params.kind = updates.kind;
    }

    if (setClause.length === 0) {
        return getEntryById(id);
    }

    const stmt = database.prepare(`
        UPDATE archive_entries 
        SET ${setClause.join(", ")}
        WHERE id = @id
    `);

    stmt.run(params);

    return getEntryById(id);
};

export const getThumbnailData = async (id) => {
    const database = getDb();
    const stmt = database.prepare(`
        SELECT thumbnail_data, thumbnail_mime 
        FROM archive_entries 
        WHERE id = ? AND thumbnail_data IS NOT NULL
    `);
    const row = stmt.get(id);
    
    if (!row || !row.thumbnail_data) {
        return null;
    }
    
    return {
        data: row.thumbnail_data,
        mime: row.thumbnail_mime || 'image/jpeg',
    };
};

export const getIndex = async () => {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM archive_entries ORDER BY created_at DESC");
    const rows = stmt.all();
    return rows.map(rowToEntry);
};

export const getEntryById = async (id) => {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM archive_entries WHERE id = ?");
    const row = stmt.get(id);
    return rowToEntry(row);
};

export const listEntries = async (options = {}) => {
    const database = getDb();
    
    let whereClause = "";
    const params = [];
    
    if (options.service) {
        whereClause = "WHERE service = ?";
        params.push(options.service);
    }
    
    // Get total count
    const countStmt = database.prepare(`
        SELECT COUNT(*) as count 
        FROM archive_entries 
        ${whereClause}
    `);
    const { count: total } = countStmt.get(...params);

    // Get paginated results
    const limit = options.limit || 50;
    const cursor = options.cursor || 0;

    const stmt = database.prepare(`
        SELECT * FROM archive_entries 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(...params, limit, cursor);

    return {
        entries: rows.map(rowToEntry),
        total,
        cursor,
        hasMore: cursor + limit < total,
    };
};

export const getFileStats = async (filePath) => {
    try {
        const { stat } = await import("fs/promises");
        const stats = await stat(filePath);
        return {
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
        };
    } catch {
        return null;
    }
};

export default {
    addToIndex,
    updateIndexEntry,
    getThumbnailData,
    getIndex,
    getEntryById,
    listEntries,
    getFileStats,
};
