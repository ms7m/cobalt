import { join } from "path";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { getConfig, setConfig, getServiceDir, setServiceDir } from "../archive/config.js";
import { listEntries, getEntryById } from "../archive/index.js";
import { env } from "../config.js";

export const setupArchiveRoutes = (app) => {
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
                ...result
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
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
            
            const config = await getConfig();
            const archiveRoot = config.archiveRoot || env.mediaArchiveRoot;
            
            if (!archiveRoot) {
                return res.status(500).json({
                    success: false,
                    error: "Archive root not configured"
                });
            }
            
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
};

export default { setupArchiveRoutes };
