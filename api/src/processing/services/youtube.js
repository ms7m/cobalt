import { exec } from "child_process";
import { promisify } from "util";
import { env } from "../../config.js";

const execAsync = promisify(exec);

const codecToFormat = {
    h264: {
        vcodec: "avc1",
        acodec: "mp4a",
        container: "mp4",
        ext: "mp4"
    },
    av1: {
        vcodec: "av01",
        acodec: "opus",
        container: "webm",
        ext: "webm"
    },
    vp9: {
        vcodec: "vp9",
        acodec: "opus",
        container: "webm",
        ext: "webm"
    }
};

const qualityToHeight = {
    "144": 144,
    "240": 240,
    "360": 360,
    "480": 480,
    "720": 720,
    "1080": 1080,
    "1440": 1440,
    "2160": 2160,
    "4320": 4320,
    "max": 9999
};

const getYtdlpPath = () => {
    return process.env.YTDLP_PATH || "yt-dlp";
};

const getDenoPath = () => {
    return process.env.DENO_PATH || "deno";
};

const executeYtdlp = async (args) => {
    const ytdlp = getYtdlpPath();
    const deno = getDenoPath();
    
    const cmd = `${ytdlp} --use-extractors youtube --js-runtime ${deno} ${args}`;
    const timeout = parseInt(process.env.YTDLP_TIMEOUT_SECONDS || "120") * 1000;
    
    try {
        const { stdout, stderr } = await execAsync(cmd, { 
            timeout,
            maxBuffer: 50 * 1024 * 1024 // 50MB buffer for JSON output
        });
        return { success: true, output: stdout, error: stderr };
    } catch (error) {
        return { success: false, error: error.message, code: error.code };
    }
};

const parseDuration = (duration) => {
    if (!duration) return 0;
    // yt-dlp duration is in seconds as a number
    return parseInt(duration) || 0;
};

const extractErrorCode = (errorMsg) => {
    if (errorMsg.includes("Private video")) return "content.video.private";
    if (errorMsg.includes("age-restricted")) return "content.video.age";
    if (errorMsg.includes("not available in your country")) return "content.video.region";
    if (errorMsg.includes("live stream")) return "content.video.live";
    if (errorMsg.includes("This video is unavailable")) return "content.video.unavailable";
    if (errorMsg.includes("too long")) return "content.too_long";
    if (errorMsg.includes("429") || errorMsg.includes("rate limit")) return "fetch.rate";
    if (errorMsg.includes("403")) return "fetch.fail";
    return "fetch.fail";
};

export default async function (o) {
    const videoId = o.id;
    const quality = o.quality === "max" ? 9999 : qualityToHeight[o.quality] || 1080;
    const codec = o.codec || "h264";
    const isAudioOnly = o.isAudioOnly;
    const isAudioMuted = o.isAudioMuted;
    const dubLang = o.dubLang;
    const subtitleLang = o.subtitleLang;
    
    const codecInfo = codecToFormat[codec];
    const containerExt = o.container === "auto" ? codecInfo.ext : o.container;
    
    try {
        // Get video info with yt-dlp
        const infoArgs = [
            "--dump-json",
            "--no-warnings",
            "--skip-download",
            `--extractor-args "youtube:lang=${dubLang || 'en'}"`,
            `https://www.youtube.com/watch?v=${videoId}`
        ];
        
        const infoResult = await executeYtdlp(infoArgs.join(" "));
        
        if (!infoResult.success) {
            return { error: extractErrorCode(infoResult.error) };
        }
        
        const info = JSON.parse(infoResult.output);
        
        // Check duration limit
        const duration = parseDuration(info.duration);
        if (duration > env.durationLimit) {
            return { error: "content.too_long" };
        }
        
        // Check if live
        if (info.is_live) {
            return { error: "content.video.live" };
        }
        
        // Check availability
        if (!info.formats || info.formats.length === 0) {
            return { error: "content.video.unavailable" };
        }
        
        // Build file metadata
        const fileMetadata = {
            title: info.title?.trim() || "Unknown",
            artist: info.uploader?.replace("- Topic", "").trim() || "Unknown"
        };
        
        if (info.description?.startsWith("Provided to YouTube by")) {
            const descItems = info.description.split("\n\n", 5);
            if (descItems.length >= 5) {
                fileMetadata.album = descItems[2];
                fileMetadata.copyright = descItems[3];
                if (descItems[4].startsWith("Released on:")) {
                    fileMetadata.date = descItems[4].replace("Released on: ", "").trim();
                }
            }
        }
        
        // Handle audio-only mode
        if (isAudioOnly) {
            const bestAudio = info.formats
                .filter(f => f.vcodec === "none" && f.acodec !== "none")
                .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
            
            if (!bestAudio) {
                return { error: "youtube.no_matching_format" };
            }
            
            const audioCodec = codec === "h264" ? "m4a" : "opus";
            const cover = info.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
            
            return {
                type: "audio",
                isAudioOnly: true,
                urls: bestAudio.url,
                filenameAttributes: {
                    service: "youtube",
                    id: videoId,
                    title: fileMetadata.title,
                    author: fileMetadata.artist
                },
                fileMetadata,
                bestAudio: audioCodec,
                isHLS: false,
                originalRequest: { ...o, id: videoId },
                cover,
                cropCover: info.uploader?.endsWith("- Topic")
            };
        }
        
        // Handle video mode
        const videoFormats = info.formats.filter(f => {
            const vcodec = f.vcodec || "";
            const height = f.height || 0;
            return vcodec.includes(codecInfo.vcodec) && height <= quality;
        }).sort((a, b) => (b.height || 0) - (a.height || 0));
        
        const bestVideo = videoFormats[0];
        
        if (!bestVideo) {
            // Fallback to any available codec if preferred not found
            const fallbackFormats = info.formats
                .filter(f => f.vcodec && f.vcodec !== "none" && (f.height || 0) <= quality)
                .sort((a, b) => (b.height || 0) - (a.height || 0));
            
            if (!fallbackFormats[0]) {
                return { error: "youtube.no_matching_format" };
            }
        }
        
        const selectedVideo = bestVideo || info.formats
            .filter(f => f.vcodec && f.vcodec !== "none")
            .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        
        // Get best audio format
        const audioFormats = info.formats
            .filter(f => f.vcodec === "none" && f.acodec !== "none")
            .sort((a, b) => (b.abr || 0) - (a.abr || 0));
        
        const selectedAudio = audioFormats[0];
        
        if (!selectedVideo) {
            return { error: "youtube.no_matching_format" };
        }
        
        const resolution = selectedVideo.height || quality;
        
        const filenameAttributes = {
            service: "youtube",
            id: videoId,
            title: fileMetadata.title,
            author: fileMetadata.artist,
            resolution: `${selectedVideo.width || 1920}x${resolution}`,
            qualityLabel: `${resolution}p`,
            extension: containerExt,
            youtubeFormat: codec,
            youtubeDubName: dubLang || false
        };
        
        // Handle subtitles
        let subtitles;
        if (subtitleLang && info.subtitles) {
            const subKeys = Object.keys(info.subtitles);
            const matchingSub = subKeys.find(key => key.startsWith(subtitleLang));
            if (matchingSub && info.subtitles[matchingSub].length > 0) {
                subtitles = {
                    url: info.subtitles[matchingSub][0].url,
                    language: matchingSub
                };
                fileMetadata.sublanguage = matchingSub;
            }
        }
        
        // Muted video mode
        if (isAudioMuted) {
            return {
                type: "mute",
                urls: selectedVideo.url,
                filenameAttributes,
                fileMetadata,
                isHLS: false,
                originalRequest: { ...o, id: videoId }
            };
        }
        
        // Merge mode (video + audio)
        if (selectedAudio) {
            return {
                type: "merge",
                urls: [selectedVideo.url, selectedAudio.url],
                filenameAttributes,
                fileMetadata,
                subtitles: subtitles?.url,
                isHLS: false,
                originalRequest: { ...o, id: videoId }
            };
        }
        
        // Single URL mode (if audio not available)
        return {
            type: "proxy",
            urls: selectedVideo.url,
            filenameAttributes,
            fileMetadata,
            isHLS: false,
            originalRequest: { ...o, id: videoId }
        };
        
    } catch (error) {
        console.error("YouTube extraction error:", error);
        return { error: "fetch.fail" };
    }
}
