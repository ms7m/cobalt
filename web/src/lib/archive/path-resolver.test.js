import test from "node:test";
import assert from "node:assert/strict";

import { detectServiceFromURL, resolveArchivePath } from "./path-resolver.js";

test("detectServiceFromURL resolves known services", () => {
    assert.equal(detectServiceFromURL("https://www.youtube.com/watch?v=abc"), "youtube");
    assert.equal(detectServiceFromURL("https://x.com/example/status/1"), "twitter");
    assert.equal(detectServiceFromURL("https://soundcloud.com/artist/track"), "soundcloud");
    assert.equal(detectServiceFromURL("https://example.com/video"), null);
});

test("resolveArchivePath applies mapping overrides", () => {
    const config = {
        archiveRoot: "/volume1/archive",
        serviceDirs: {
            soundcloud: "music",
        },
    };

    const mapped = resolveArchivePath(config, "soundcloud");
    assert.equal(mapped?.fullPath, "/volume1/archive/music");

    const fallback = resolveArchivePath(config, "youtube");
    assert.equal(fallback?.fullPath, "/volume1/archive/youtube");
});
