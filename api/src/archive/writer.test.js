import test from "node:test";
import assert from "node:assert/strict";

import { inferKind } from "./writer.js";

test("inferKind detects video/audio/image by mime", () => {
    assert.equal(inferKind("video/mp4", "file.bin"), "video");
    assert.equal(inferKind("audio/mpeg", "file.bin"), "audio");
    assert.equal(inferKind("image/jpeg", "file.bin"), "image");
});

test("inferKind falls back to extension", () => {
    assert.equal(inferKind("application/octet-stream", "movie.webm"), "video");
    assert.equal(inferKind("application/octet-stream", "track.flac"), "audio");
    assert.equal(inferKind("application/octet-stream", "cover.png"), "image");
    assert.equal(inferKind("application/octet-stream", "archive.dat"), "other");
});
