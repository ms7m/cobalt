import { access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { join } from "path";

import { env } from "../config.js";
import { getConfig } from "../archive/config.js";
import { listEntries, updateIndexEntry } from "../archive/index-sqlite.js";
import { inferKind, generateThumbnailForArchivedFile } from "../archive/writer-sqlite.js";

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
    console.log("  --force    regenerate thumbnails even if already exist in DB");
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

    const entries = await listEntries({ limit: 10000 });
    console.log(`Loaded ${entries.total} archive entries`);

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let missing = 0;
    let failed = 0;

    for (const entry of entries.entries) {
        if (limit > 0 && processed >= limit) {
            break;
        }

        processed += 1;
        const fullPath = join(archiveRoot, entry.relativePath);

        const sourceExists = await fileExists(fullPath);
        if (!sourceExists) {
            missing += 1;
            continue;
        }

        // Skip if already has thumbnail and not forcing
        if (!force && entry.hasThumbnail) {
            skipped += 1;
            continue;
        }

        try {
            const generated = await generateThumbnailForArchivedFile({
                fullPath,
                mime: entry.mime,
                filename: entry.filename,
                coverURL: null,
            });

            if (generated.thumbnailBuffer) {
                await updateIndexEntry(entry.id, {
                    thumbnailData: generated.thumbnailBuffer,
                    thumbnailMime: generated.thumbnailMime,
                    kind: generated.kind,
                });
                updated += 1;
                console.log(`✓ Generated thumbnail for ${entry.filename}`);
            } else {
                failed += 1;
                console.log(`✗ Failed to generate thumbnail for ${entry.filename}`);
            }
        } catch (err) {
            failed += 1;
            console.log(`✗ Error processing ${entry.filename}: ${err.message}`);
        }
    }

    console.log("\nBackfill complete");
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
