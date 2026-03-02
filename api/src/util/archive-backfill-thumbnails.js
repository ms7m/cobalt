import { access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { join } from "path";

import { env } from "../config.js";
import { getConfig } from "../archive/config.js";
import { getIndex, updateIndexEntry } from "../archive/index.js";
import { inferKind, generateThumbnailForArchivedFile } from "../archive/writer.js";

const hasArg = (arg) => process.argv.includes(arg);
const getArgValue = (name, fallback = undefined) => {
    const idx = process.argv.indexOf(name);
    if (idx === -1) return fallback;
    return process.argv[idx + 1] ?? fallback;
};

const fileExists = async (path) => {
    try {
        await access(path, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
};

const parseLimit = () => {
    const raw = getArgValue("--limit", "0");
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return 0;
    return parsed;
};

const usage = () => {
    console.log("Usage: node src/util/archive-backfill-thumbnails [--force] [--limit N]");
    console.log("  --force    regenerate thumbnails even if thumbnailPath already exists");
    console.log("  --limit N  process at most N entries (0 = all)");
};

if (hasArg("--help") || hasArg("-h")) {
    usage();
    process.exit(0);
}

const run = async () => {
    const force = hasArg("--force");
    const limit = parseLimit();

    const config = await getConfig();
    const archiveRoot = config.archiveRoot || env.mediaArchiveRoot;

    if (!archiveRoot) {
        throw new Error("Archive root is not configured. Set MEDIA_ARCHIVE_ROOT or archive config.");
    }

    const entries = await getIndex();
    console.log(`Loaded ${entries.length} archive entries`);

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let missing = 0;
    let failed = 0;

    for (const entry of entries) {
        if (limit > 0 && processed >= limit) {
            break;
        }

        processed += 1;
        const fullPath = join(archiveRoot, entry.relativePath);
        const fullThumbPath = entry.thumbnailPath
            ? join(archiveRoot, entry.thumbnailPath)
            : `${fullPath}.thumb.jpg`;

        const sourceExists = await fileExists(fullPath);
        if (!sourceExists) {
            missing += 1;
            continue;
        }

        const thumbExists = await fileExists(fullThumbPath);
        const resolvedKind = entry.kind || inferKind(entry.mime, entry.filename);

        if (!force && entry.thumbnailPath && thumbExists && entry.kind) {
            skipped += 1;
            continue;
        }

        try {
            const generated = await generateThumbnailForArchivedFile({
                fullPath,
                relativePath: entry.relativePath,
                mime: entry.mime,
                filename: entry.filename,
                coverURL: null,
            });

            const updates = {
                kind: generated.kind || resolvedKind,
                thumbnailPath: generated.thumbnailPath || (thumbExists ? entry.thumbnailPath : null),
            };

            await updateIndexEntry(entry.id, updates);
            updated += 1;
        } catch {
            failed += 1;
        }
    }

    console.log("Backfill complete");
    console.log(`Processed: ${processed}`);
    console.log(`Updated:   ${updated}`);
    console.log(`Skipped:   ${skipped}`);
    console.log(`Missing:   ${missing}`);
    console.log(`Failed:    ${failed}`);
};

run().catch((error) => {
    console.error("Backfill failed:", error?.message || error);
    process.exit(1);
});
