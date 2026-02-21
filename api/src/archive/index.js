import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { join, dirname } from "path";
import { nanoid } from "nanoid";

const INDEX_PATH = process.env.ARCHIVE_INDEX_PATH || "./archive-index.jsonl";

let index = [];
let indexLoaded = false;

const loadIndex = async () => {
    if (indexLoaded) return index;
    
    try {
        const data = await readFile(INDEX_PATH, 'utf8');
        const lines = data.split('\n').filter(line => line.trim());
        index = lines.map(line => JSON.parse(line));
        indexLoaded = true;
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error('Failed to load archive index:', e);
        }
        indexLoaded = true;
    }
    
    return index;
};

const saveIndex = async () => {
    try {
        await mkdir(dirname(INDEX_PATH), { recursive: true });
        const lines = index.map(entry => JSON.stringify(entry));
        await writeFile(INDEX_PATH, lines.join('\n') + '\n');
    } catch (e) {
        console.error('Failed to save archive index:', e);
        throw e;
    }
};

export const addToIndex = async (entry) => {
    await loadIndex();
    
    const indexEntry = {
        id: nanoid(12),
        service: entry.service,
        filename: entry.filename,
        relativePath: entry.relativePath,
        size: entry.size || 0,
        mime: entry.mime || 'application/octet-stream',
        createdAt: new Date().toISOString()
    };
    
    index.unshift(indexEntry);
    
    if (index.length > 10000) {
        index = index.slice(0, 10000);
    }
    
    await saveIndex();
    return indexEntry;
};

export const getIndex = async () => {
    return await loadIndex();
};

export const getEntryById = async (id) => {
    await loadIndex();
    return index.find(e => e.id === id);
};

export const listEntries = async (options = {}) => {
    await loadIndex();
    
    let entries = [...index];
    
    if (options.service) {
        entries = entries.filter(e => e.service === options.service);
    }
    
    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const total = entries.length;
    const limit = options.limit || 50;
    const cursor = options.cursor || 0;
    
    const paginated = entries.slice(cursor, cursor + limit);
    
    return {
        entries: paginated,
        total,
        cursor,
        hasMore: cursor + limit < total
    };
};

export const getFileStats = async (filePath) => {
    try {
        const stats = await stat(filePath);
        return {
            size: stats.size,
            createdAt: stats.birthtime.toISOString()
        };
    } catch {
        return null;
    }
};

export default {
    addToIndex,
    getIndex,
    getEntryById,
    listEntries,
    getFileStats
};
