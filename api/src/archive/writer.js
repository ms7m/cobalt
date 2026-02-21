import { env } from "../config.js";
import { mkdir, writeFile, rename, unlink, stat, access } from "fs/promises";
import { dirname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { getConfig, getServiceDir } from "./config.js";
import { addToIndex, getFileStats } from "./index.js";

const sanitizeFilename = (filename) => {
    return filename
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\.{2,}/g, '.')
        .slice(0, 200);
};

const ensureDirectory = async (dirPath) => {
    try {
        await mkdir(dirPath, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
};

const getUniqueFilename = async (dirPath, filename) => {
    const sanitized = sanitizeFilename(filename);
    let finalPath = join(dirPath, sanitized);
    
    try {
        await access(finalPath);
        // File exists, add suffix
        const lastDot = sanitized.lastIndexOf('.');
        const name = lastDot > 0 ? sanitized.slice(0, lastDot) : sanitized;
        const ext = lastDot > 0 ? sanitized.slice(lastDot) : '';
        
        let counter = 1;
        while (true) {
            const newName = `${name} (${counter})${ext}`;
            finalPath = join(dirPath, newName);
            try {
                await access(finalPath);
                counter++;
            } catch {
                return newName;
            }
        }
    } catch {
        // File doesn't exist, use original
        return sanitized;
    }
};

const getArchivePath = async (service, filename) => {
    const config = await getConfig();
    const archiveRoot = config.archiveRoot || env.mediaArchiveRoot;
    
    if (!archiveRoot) return null;
    
    const serviceFolder = getServiceDir(service);
    const safeService = serviceFolder.replace(/[^a-z0-9_/-]/gi, '_');
    const dirPath = join(archiveRoot, safeService);
    
    const uniqueFilename = await getUniqueFilename(dirPath, filename);
    const fullPath = join(dirPath, uniqueFilename);
    
    return {
        fullPath,
        relativePath: join(safeService, uniqueFilename),
        filename: uniqueFilename
    };
};

export const archiveStream = async (service, filename, stream, mime = 'application/octet-stream') => {
    const pathInfo = await getArchivePath(service, filename);
    if (!pathInfo) return null;

    const { fullPath, relativePath } = pathInfo;
    const partPath = fullPath + '.part';

    try {
        await ensureDirectory(dirname(fullPath));

        const writeStream = createWriteStream(partPath);
        await pipeline(stream, writeStream);

        await rename(partPath, fullPath);

        // Get file stats and add to index
        const stats = await getFileStats(fullPath);
        await addToIndex({
            service,
            filename: pathInfo.filename,
            relativePath,
            size: stats?.size || 0,
            mime
        });

        return fullPath;
    } catch (error) {
        try {
            await unlink(partPath);
        } catch {}
        return null;
    }
};

export const createArchiveTee = async (service, filename, responseStream, mime = 'application/octet-stream') => {
    const pathInfo = await getArchivePath(service, filename);
    if (!pathInfo) return responseStream;

    const { fullPath, relativePath } = pathInfo;
    const partPath = fullPath + '.part';
    let writeStream;
    let isComplete = false;
    let hasError = false;

    try {
        await ensureDirectory(dirname(fullPath));
        writeStream = createWriteStream(partPath);
    } catch {
        hasError = true;
        return responseStream;
    }

    const teeStream = new Readable({
        read() {}
    });

    responseStream.on('data', (chunk) => {
        teeStream.push(chunk);
        if (writeStream && !hasError) {
            writeStream.write(chunk);
        }
    });

    responseStream.on('end', async () => {
        teeStream.push(null);
        if (writeStream && !hasError) {
            writeStream.end();
            try {
                await rename(partPath, fullPath);
                const stats = await getFileStats(fullPath);
                await addToIndex({
                    service,
                    filename: pathInfo.filename,
                    relativePath,
                    size: stats?.size || 0,
                    mime
                });
            } catch {
                try { await unlink(partPath); } catch {}
            }
        }
    });

    responseStream.on('error', async () => {
        teeStream.push(null);
        if (writeStream && !hasError) {
            writeStream.destroy();
            try { await unlink(partPath); } catch {}
        }
    });

    return teeStream;
};

export const archiveFFmpegOutput = async (service, filename, mime = 'application/octet-stream') => {
    const pathInfo = await getArchivePath(service, filename);
    if (!pathInfo) return null;

    const { fullPath, relativePath } = pathInfo;
    const partPath = fullPath + '.part';
    let writeStream;
    let isInitialized = false;

    return {
        async initialize() {
            if (isInitialized) return;
            try {
                await ensureDirectory(dirname(fullPath));
                writeStream = createWriteStream(partPath);
                isInitialized = true;
            } catch {
                return null;
            }
            return writeStream;
        },
        write(chunk) {
            if (writeStream && isInitialized) {
                writeStream.write(chunk);
            }
        },
        async finalize() {
            if (writeStream && isInitialized) {
                writeStream.end();
                try {
                    await rename(partPath, fullPath);
                    const stats = await getFileStats(fullPath);
                    await addToIndex({
                        service,
                        filename: pathInfo.filename,
                        relativePath,
                        size: stats?.size || 0,
                        mime
                    });
                    return fullPath;
                } catch {
                    try { await unlink(partPath); } catch {}
                    return null;
                }
            }
            return null;
        },
        async abort() {
            if (writeStream && isInitialized) {
                writeStream.destroy();
                try { await unlink(partPath); } catch {}
            }
        }
    };
};

export default {
    archiveStream,
    createArchiveTee,
    archiveFFmpegOutput
};
