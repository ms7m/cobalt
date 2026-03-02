import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";

import { browseArchivePath, normalizeRelativePath } from "./browse.js";

test("normalizeRelativePath blocks traversal", () => {
    assert.equal(normalizeRelativePath(""), "");
    assert.equal(normalizeRelativePath("youtube/music"), "youtube/music");
    assert.throws(() => normalizeRelativePath("../secret"), /Invalid path/);
});

test("browseArchivePath lists directories first and includes file sizes", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "cobalt-archive-browse-"));

    try {
        await mkdir(path.join(tempRoot, "music"), { recursive: true });
        await writeFile(path.join(tempRoot, "notes.txt"), "hello world");

        const result = await browseArchivePath({ rootPath: tempRoot, requestedPath: "", includeFiles: true });

        assert.equal(result.currentPath, "");
        assert.equal(result.parentPath, null);
        assert.equal(result.entries.length, 2);

        assert.equal(result.entries[0].type, "directory");
        assert.equal(result.entries[0].name, "music");

        assert.equal(result.entries[1].type, "file");
        assert.equal(result.entries[1].name, "notes.txt");
        assert.equal(result.entries[1].size, 11);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

test("browseArchivePath rejects escaped paths", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "cobalt-archive-browse-"));

    try {
        await assert.rejects(
            () => browseArchivePath({ rootPath: tempRoot, requestedPath: "../outside", includeFiles: true }),
            /Invalid path/
        );
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});
