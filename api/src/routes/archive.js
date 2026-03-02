import { join, normalize, resolve, sep } from "path";
import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import { getConfig, setConfig, getServiceDir, setServiceDir } from "../archive/config.js";
import { listEntries, getEntryById } from "../archive/index.js";
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

    const normalizeRelativePath = (inputPath = "") => {
        const safeInput = String(inputPath || "").replace(/\\/g, '/');
        const normalized = normalize(safeInput)
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')
            .replace(/^\.\//, '');

        if (!normalized || normalized === '.') return '';
        if (normalized === '..' || normalized.startsWith('../')) {
            throw new Error("Invalid path");
        }

        return normalized;
    };

    const isInsideRoot = (root, candidate) => {
        return candidate === root || candidate.startsWith(`${root}${sep}`);
    };

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

    // Browse archive directories/files for NAS mapping UI
    app.get('/archive/browse', async (req, res) => {
        try {
            const rootPath = resolve(await resolveArchiveRoot());
            const requestedPath = normalizeRelativePath(req.query.path);
            const includeFiles = req.query.includeFiles !== '0';
            const absolutePath = resolve(rootPath, requestedPath);

            if (!isInsideRoot(rootPath, absolutePath)) {
                return res.status(400).json({
                    success: false,
                    error: "Path escapes archive root"
                });
            }

            const stats = await stat(absolutePath);
            if (!stats.isDirectory()) {
                return res.status(400).json({
                    success: false,
                    error: "Path is not a directory"
                });
            }

            const dirEntries = await readdir(absolutePath, { withFileTypes: true });
            const entries = [];

            for (const entry of dirEntries) {
                const isDirectory = entry.isDirectory();
                const isFile = entry.isFile();

                if (!isDirectory && (!includeFiles || !isFile)) {
                    continue;
                }

                if (!isDirectory && !isFile) {
                    continue;
                }

                const entryAbsolutePath = join(absolutePath, entry.name);
                const entryStats = await stat(entryAbsolutePath);
                const entryRelativePath = requestedPath
                    ? `${requestedPath}/${entry.name}`
                    : entry.name;

                entries.push({
                    name: entry.name,
                    path: entryRelativePath,
                    type: isDirectory ? 'directory' : 'file',
                    size: isFile ? entryStats.size : null,
                    modifiedAt: entryStats.mtime.toISOString()
                });
            }

            entries.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }

                return a.name.localeCompare(b.name);
            });

            const parentPath = requestedPath.includes('/')
                ? requestedPath.slice(0, requestedPath.lastIndexOf('/'))
                : (requestedPath ? '' : null);

            res.json({
                success: true,
                root: rootPath,
                currentPath: requestedPath,
                parentPath,
                entries
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
};

export default { setupArchiveRoutes };
