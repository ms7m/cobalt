import { env } from "../config.js";
import { mkdir, writeFile, rename, unlink } from "fs/promises";
import { dirname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";

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

const getArchivePath = (service, filename) => {
    if (!env.mediaArchiveRoot) return null;
    
    const safeService = service.replace(/[^a-z0-9_-]/gi, '_');
    const safeFilename = sanitizeFilename(filename);
    const timestamp = Date.now();
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const [name, ext] = safeFilename.split(/\.(?=[^.]+$)/);
    const uniqueFilename = `${name}_${timestamp}_${uniqueSuffix}${ext ? '.' + ext : ''}`;
    
    return join(env.mediaArchiveRoot, safeService, uniqueFilename);
};

export const archiveStream = async (service, filename, stream) => {
    const archivePath = getArchivePath(service, filename);
    if (!archivePath) return null;
    
    const partPath = archivePath + '.part';
    
    try {
        await ensureDirectory(dirname(archivePath));
        
        const writeStream = createWriteStream(partPath);
        await pipeline(stream, writeStream);
        
        await rename(partPath, archivePath);
        return archivePath;
    } catch (error) {
        try {
            await unlink(partPath);
        } catch {}
        return null;
    }
};

export const createArchiveTee = (service, filename, responseStream) => {
    const archivePath = getArchivePath(service, filename);
    if (!archivePath) return responseStream;
    
    const partPath = archivePath + '.part';
    let writeStream;
    let isComplete = false;
    let hasError = false;
    
    const ensureDirAndCreateStream = async () => {
        try {
            await ensureDirectory(dirname(archivePath));
            writeStream = createWriteStream(partPath);
        } catch {
            hasError = true;
        }
    };
    
    ensureDirAndCreateStream();
    
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
                await rename(partPath, archivePath);
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

export const archiveFFmpegOutput = (service, filename) => {
    const archivePath = getArchivePath(service, filename);
    if (!archivePath) return null;
    
    const partPath = archivePath + '.part';
    let writeStream;
    let isInitialized = false;
    
    return {
        async initialize() {
            if (isInitialized) return;
            try {
                await ensureDirectory(dirname(archivePath));
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
                    await rename(partPath, archivePath);
                    return archivePath;
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
