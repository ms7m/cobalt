import { get } from "svelte/store";
import { t } from "$lib/i18n/translations";
import settings from "$lib/state/settings";
import lazySettingGetter from "$lib/settings/lazy-get";
import { createBackgroundJob, type ArchiveJob } from "$lib/api/archive";
import { downloadButtonState } from "$lib/state/omnibox";
import { createDialog } from "$lib/state/dialogs";
import { backgroundJobs } from "$lib/state/background-jobs";

type BackgroundJobArgs = {
    url?: string;
    service?: string;
};

export const submitBackgroundJob = async ({ url, service }: BackgroundJobArgs): Promise<ArchiveJob | null> => {
    downloadButtonState.set("think");

    const getSetting = lazySettingGetter(get(settings));

    if (!url) {
        downloadButtonState.set("error");
        createDialog({
            id: "save-error",
            type: "small",
            meowbalt: "error",
            buttons: [
                {
                    text: get(t)("button.gotit"),
                    main: true,
                    action: () => {},
                },
            ],
            bodyText: get(t)("error.api.link.missing"),
        });
        return null;
    }

    const request = {
        url,
        service: service || undefined,
        alwaysProxy: getSetting("save", "alwaysProxy"),
        downloadMode: getSetting("save", "downloadMode"),
        subtitleLang: getSetting("save", "subtitleLang"),
        filenameStyle: getSetting("save", "filenameStyle"),
        disableMetadata: getSetting("save", "disableMetadata"),
        audioFormat: getSetting("save", "audioFormat"),
        audioBitrate: getSetting("save", "audioBitrate"),
        tiktokFullAudio: getSetting("save", "tiktokFullAudio"),
        youtubeDubLang: getSetting("save", "youtubeDubLang"),
        youtubeBetterAudio: getSetting("save", "youtubeBetterAudio"),
        videoQuality: getSetting("save", "videoQuality"),
        youtubeVideoCodec: getSetting("save", "youtubeVideoCodec"),
        youtubeVideoContainer: getSetting("save", "youtubeVideoContainer"),
        youtubeHLS: getSetting("save", "youtubeHLS"),
        allowH265: getSetting("save", "allowH265"),
        convertGif: getSetting("save", "convertGif"),
    };

    const result = await createBackgroundJob(request);

    if (!result.success || !result.job) {
        downloadButtonState.set("error");
        createDialog({
            id: "save-error",
            type: "small",
            meowbalt: "error",
            buttons: [
                {
                    text: get(t)("button.gotit"),
                    main: true,
                    action: () => {},
                },
            ],
            bodyText: result.error || get(t)("error.api.unreachable"),
        });
        return null;
    }

    downloadButtonState.set("done");

    // Add job to store immediately so it appears in the queue
    backgroundJobs.addJob(result.job);

    createDialog({
        id: "job-submitted",
        type: "small",
        meowbalt: "smile",
        buttons: [
            {
                text: get(t)("button.gotit"),
                main: true,
                action: () => {},
            },
        ],
        bodyText: `Added to background jobs: ${result.job.filename || result.job.id}`,
    });

    return result.job;
};
