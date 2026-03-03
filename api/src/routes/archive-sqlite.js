import { join } from "path";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import mime from "mime";
import { getConfig, setConfig, getServiceDir, setServiceDir } from "../archive/config.js";
import { listEntries, getEntryById, getThumbnailData } from "../archive/index-sqlite.js";
import { browseArchivePath } from "../archive/browse.js";
import { env } from "../config.js";

export const setupArchiveRoutes = (app) => {
    const resolveArchiveRoot = async () => {
        const config = await getConfig();
        const archiveRoot = config.archiveRoot || env.mediaArchiveRoot;

        if (!archiveRoot) {
            throw new Error("Archive root not configured");
        }

        return archiveRoot;
    };

    const withPublicMediaLinks = (entry) => ({
        ...entry,
        fileUrl: `/archive/file/${entry.id}`,
        streamUrl: entry.kind === 'video' || entry.kind === 'audio' ? `/archive/file/${entry.id}/stream` : null,
        thumbnailUrl: entry.hasThumbnail ? `/archive/file/${entry.id}/thumbnail` : null,
    });

    // Get archive configuration
    app.get('/archive/config', async (req, res) => {
        try {
            const config = await getConfig();
            res.json({
                success: true,
                config: {
                    archiveRoot: config.archiveRoot || env.mediaArchiveRoot || "",
                    serviceDirs: config.serviceDirs || {}
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Update archive configuration
    app.put('/archive/config', async (req, res) => {
        try {
            const { archiveRoot, serviceDirs } = req.body;
            
            const updates = {};
            if (archiveRoot !== undefined) {
                updates.archiveRoot = archiveRoot;
            }
            if (serviceDirs !== undefined) {
                updates.serviceDirs = serviceDirs;
            }
            
            const config = await setConfig(updates);
            res.json({
                success: true,
                config: {
                    archiveRoot: config.archiveRoot || env.mediaArchiveRoot || "",
                    serviceDirs: config.serviceDirs || {}
                }
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    });

    // Set service directory override
    app.put('/archive/config/services/:service', async (req, res) => {
        try {
            const { service } = req.params;
            const { directory } = req.body;
            
            await setServiceDir(service, directory);
            const config = await getConfig();
            
            res.json({
                success: true,
                service,
                directory: getServiceDir(service),
                config: {
                    archiveRoot: config.archiveRoot || env.mediaArchiveRoot || "",
                    serviceDirs: config.serviceDirs || {}
                }
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    });

    // List archived downloads
    app.get('/archive/downloads', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const cursor = parseInt(req.query.cursor) || 0;
            const service = req.query.service;
            
            const result = await listEntries({ limit, cursor, service });
            
            res.json({
                success: true,
                ...result,
                entries: result.entries.map(withPublicMediaLinks),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Browse archive directories/files for NAS mapping UI
    app.get('/archive/browse', async (req, res) => {
        try {
            const rootPath = await resolveArchiveRoot();
            const includeFiles = req.query.includeFiles !== '0';
            const browserData = await browseArchivePath({
                rootPath,
                requestedPath: req.query.path,
                includeFiles,
            });

            res.json({
                success: true,
                ...browserData
            });
        } catch (error) {
            const message = error?.message || "Failed to browse archive path";
            const status = ["Archive root not configured", "Invalid path"].includes(message)
                ? 400
                : 500;
            res.status(status).json({
                success: false,
                error: message
            });
        }
    });

    // Download archived file by ID
    app.get('/archive/file/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const entry = await getEntryById(id);
            
            if (!entry) {
                return res.status(404).json({
                    success: false,
                    error: "File not found"
                });
            }
            
            const archiveRoot = await resolveArchiveRoot();
            
            const filePath = join(archiveRoot, entry.relativePath);
            
            // Check if file exists
            try {
                const stats = await stat(filePath);
                
                res.setHeader('Content-Type', entry.mime);
                res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
                res.setHeader('Content-Length', stats.size);
                
                const stream = createReadStream(filePath);
                stream.pipe(res);
            } catch (e) {
                res.status(404).json({
                    success: false,
                    error: "File not found on disk"
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Stream archived file inline (supports browser video/audio playback)
    app.get('/archive/file/:id/stream', async (req, res) => {
        try {
            const { id } = req.params;
            const entry = await getEntryById(id);

            if (!entry) {
                return res.status(404).json({
                    success: false,
                    error: "File not found"
                });
            }

            const archiveRoot = await resolveArchiveRoot();
            const filePath = join(archiveRoot, entry.relativePath);
            const stats = await stat(filePath);

            const contentType = entry.mime || mime.getType(entry.filename) || 'application/octet-stream';
            const range = req.headers.range;

            if (range) {
                const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
                const start = parseInt(startStr, 10);
                const end = endStr ? parseInt(endStr, 10) : stats.size - 1;

                if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stats.size) {
                    res.status(416).setHeader('Content-Range', `bytes */${stats.size}`).end();
                    return;
                }

                res.status(206);
                res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
                res.setHeader('Accept-Ranges', 'bytes');
                res.setHeader('Content-Length', end - start + 1);
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `inline; filename="${entry.filename}"`);

                createReadStream(filePath, { start, end }).pipe(res);
                return;
            }

            res.status(200);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Disposition', `inline; filename="${entry.filename}"`);
            createReadStream(filePath).pipe(res);
        } catch {
            res.status(404).json({
                success: false,
                error: "File not found on disk"
            });
        }
    });

    // Serve thumbnail from database
    app.get('/archive/file/:id/thumbnail', async (req, res) => {
        try {
            const { id } = req.params;
            const thumbnail = await getThumbnailData(id);

            if (!thumbnail) {
                return res.status(404).json({
                    success: false,
                    error: "Thumbnail not found"
                });
            }

            res.setHeader('Content-Type', thumbnail.mime);
            res.setHeader('Content-Length', thumbnail.data.length);
            res.send(thumbnail.data);
        } catch (error) {
            res.status(404).json({
                success: false,
                error: "Thumbnail not found"
            });
        }
    });
};

export default { setupArchiveRoutes };
