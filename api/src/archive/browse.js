import { join, normalize, resolve, sep } from "path";
import { readdir, stat } from "fs/promises";

export const normalizeRelativePath = (inputPath = "") => {
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

export const isInsideRoot = (root, candidate) => {
    return candidate === root || candidate.startsWith(`${root}${sep}`);
};

export const browseArchivePath = async ({ rootPath, requestedPath = "", includeFiles = true }) => {
    const resolvedRoot = resolve(rootPath);
    const currentPath = normalizeRelativePath(requestedPath);
    const absolutePath = resolve(resolvedRoot, currentPath);

    if (!isInsideRoot(resolvedRoot, absolutePath)) {
        throw new Error("Path escapes archive root");
    }

    const stats = await stat(absolutePath);
    if (!stats.isDirectory()) {
        throw new Error("Path is not a directory");
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
        const entryRelativePath = currentPath
            ? `${currentPath}/${entry.name}`
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

    const parentPath = currentPath.includes('/')
        ? currentPath.slice(0, currentPath.lastIndexOf('/'))
        : (currentPath ? '' : null);

    return {
        root: resolvedRoot,
        currentPath,
        parentPath,
        entries,
    };
};

export default {
    normalizeRelativePath,
    isInsideRoot,
    browseArchivePath,
};
