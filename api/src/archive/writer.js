import { env } from "../config.js";
import { mkdir, writeFile, rename, unlink, stat, access } from "fs/promises";
import { dirname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import ffmpeg from "ffmpeg-static";
import { spawn } from "child_process";
import { getConfig, getServiceDir } from "./config.js";
import { addToIndex, updateIndexEntry, getFileStats } from "./index.js";

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

const coverImageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

export const inferKind = (mime, filename) => {
    const lowerName = String(filename || '').toLowerCase();

    if (String(mime || '').startsWith('video/')) return 'video';
    if (String(mime || '').startsWith('audio/')) return 'audio';
    if (String(mime || '').startsWith('image/')) return 'image';

    if (['.mp4', '.webm', '.mkv', '.mov'].some(ext => lowerName.endsWith(ext))) return 'video';
    if (['.mp3', '.m4a', '.opus', '.ogg', '.wav', '.flac'].some(ext => lowerName.endsWith(ext))) return 'audio';
    if (coverImageExtensions.some(ext => lowerName.endsWith(ext))) return 'image';

    return 'other';
};

const thumbnailPathFor = (fullPath, relativePath) => {
    return {
        fullPath: `${fullPath}.thumb.jpg`,
        relativePath: `${relativePath}.thumb.jpg`,
    };
};

const generateVideoThumbnail = async (inputPath, outputPath) => {
    if (!ffmpeg) return false;

    return await new Promise((resolve) => {
        const proc = spawn(ffmpeg, [
            '-y',
            '-ss', '00:00:01.000',
            '-i', inputPath,
            '-frames:v', '1',
            '-vf', 'scale=640:-1',
            '-q:v', '3',
            outputPath,
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });

        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
};

const extractEmbeddedAudioCover = async (inputPath, outputPath) => {
    if (!ffmpeg) return false;

    return await new Promise((resolve) => {
        const proc = spawn(ffmpeg, [
            '-y',
            '-i', inputPath,
            '-an',
            '-frames:v', '1',
            '-vf', 'scale=640:-1',
            '-q:v', '3',
            outputPath,
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });

        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
};

const writeRemoteCoverThumbnail = async (coverURL, outputPath) => {
    if (!coverURL) return false;

    try {
        const response = await fetch(coverURL);
        if (!response.ok || !response.body) return false;

        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(outputPath, buffer);
        return true;
    } catch {
        return false;
    }
};

const maybeGenerateThumbnail = async ({ fullPath, relativePath, mime, filename, coverURL }) => {
    const kind = inferKind(mime, filename);
    const thumb = thumbnailPathFor(fullPath, relativePath);

    let thumbnailPath = null;

    if (kind === 'video') {
        const success = await generateVideoThumbnail(fullPath, thumb.fullPath);
        if (success) {
            thumbnailPath = thumb.relativePath;
        }
    }

    if (kind === 'audio' && coverURL) {
        const success = await writeRemoteCoverThumbnail(coverURL, thumb.fullPath);
        if (success) {
            thumbnailPath = thumb.relativePath;
        }
    }

    if (kind === 'audio' && !thumbnailPath) {
        const success = await extractEmbeddedAudioCover(fullPath, thumb.fullPath);
        if (success) {
            thumbnailPath = thumb.relativePath;
        }
    }

    return {
        kind,
        thumbnailPath,
    };
};

export const generateThumbnailForArchivedFile = async ({ fullPath, relativePath, mime, filename, coverURL }) => {
    return maybeGenerateThumbnail({ fullPath, relativePath, mime, filename, coverURL });
};

const queueThumbnailGeneration = ({ entryId, fullPath, relativePath, mime, filename, coverURL }) => {
    if (!entryId) return;

    setImmediate(async () => {
        try {
            const media = await maybeGenerateThumbnail({
                fullPath,
                relativePath,
                mime,
                filename,
                coverURL,
            });

            if (media.thumbnailPath) {
                await updateIndexEntry(entryId, {
                    thumbnailPath: media.thumbnailPath,
                });
            }
        } catch {
            // thumbnail generation is best-effort and async
        }
    });
};

export const archiveStream = async (service, filename, stream, mime = 'application/octet-stream', options = {}) => {
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
        const kind = inferKind(mime, pathInfo.filename);

        const indexEntry = await addToIndex({
            service,
            filename: pathInfo.filename,
            relativePath,
            size: stats?.size || 0,
            mime,
            kind,
            thumbnailPath: null,
        });

        queueThumbnailGeneration({
            entryId: indexEntry?.id,
            fullPath,
            relativePath,
            mime,
            filename: pathInfo.filename,
            coverURL: options.cover,
        });

        return fullPath;
    } catch (error) {
        try {
            await unlink(partPath);
        } catch {}
        return null;
    }
};

export const createArchiveTee = async (service, filename, responseStream, mime = 'application/octet-stream', options = {}) => {
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
                const kind = inferKind(mime, pathInfo.filename);

                const indexEntry = await addToIndex({
                    service,
                    filename: pathInfo.filename,
                    relativePath,
                    size: stats?.size || 0,
                    mime,
                    kind,
                    thumbnailPath: null,
                });

                queueThumbnailGeneration({
                    entryId: indexEntry?.id,
                    fullPath,
                    relativePath,
                    mime,
                    filename: pathInfo.filename,
                    coverURL: options.cover,
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

export const archiveFFmpegOutput = async (service, filename, mime = 'application/octet-stream', options = {}) => {
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
                    const kind = inferKind(mime, pathInfo.filename);

                    const indexEntry = await addToIndex({
                        service,
                        filename: pathInfo.filename,
                        relativePath,
                        size: stats?.size || 0,
                        mime,
                        kind,
                        thumbnailPath: null,
                    });

                    queueThumbnailGeneration({
                        entryId: indexEntry?.id,
                        fullPath,
                        relativePath,
                        mime,
                        filename: pathInfo.filename,
                        coverURL: options.cover,
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
