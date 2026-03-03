<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import {
        listArchiveDownloads,
        downloadArchiveFile,
        streamArchiveFile,
        archiveThumbnail,
        type ArchiveEntry
    } from "$lib/api/archive";

    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconFolder from "@tabler/icons-svelte/IconFolder.svelte";
    import IconRefresh from "@tabler/icons-svelte/IconRefresh.svelte";
    import IconPlayerPlay from "@tabler/icons-svelte/IconPlayerPlay.svelte";
    import IconX from "@tabler/icons-svelte/IconX.svelte";

    let entries: ArchiveEntry[] = [];
    let loading = true;
    let error: string | null = null;
    let hasMore = false;
    let cursor = 0;
    let selectedService = "";
    let previewEntry: ArchiveEntry | null = null;

    const services = ["youtube", "twitter", "instagram", "tiktok", "soundcloud", "vimeo", "reddit", "twitch", "bilibili", "other"];

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const loadDownloads = async (reset = false) => {
        if (reset) {
            cursor = 0;
            entries = [];
        }

        loading = true;
        error = null;

        try {
            const result = await listArchiveDownloads({
                limit: 50,
                cursor,
                service: selectedService || undefined
            });

            if (result) {
                entries = reset ? result.entries : [...entries, ...result.entries];
                hasMore = result.hasMore;
                cursor = result.cursor + result.entries.length;
            } else {
                error = "Failed to load downloads";
            }
        } catch (e) {
            error = "An error occurred while loading downloads";
        } finally {
            loading = false;
        }
    };

    const loadMore = () => {
        loadDownloads(false);
    };

    const filterByService = (service: string) => {
        selectedService = selectedService === service ? "" : service;
        loadDownloads(true);
    };

    onMount(() => {
        loadDownloads(true);
    });

    const openPreview = (entry: ArchiveEntry) => {
        if (entry.kind !== "video" && entry.kind !== "audio") {
            return;
        }

        previewEntry = entry;
    };

    const closePreview = () => {
        previewEntry = null;
    };
</script>

<svelte:head>
    <title>{$t("tabs.downloads")} ~ {$t("general.cobalt")}</title>
    <meta property="og:title" content="{$t("tabs.downloads")} ~ {$t("general.cobalt")}" />
</svelte:head>

<div id="downloads-page-wrapper">
    <main id="downloads-page">
        <header id="downloads-header">
            <h1>{$t("downloads.title")}</h1>
            <button
                class="button icon-button"
                on:click={() => loadDownloads(true)}
                disabled={loading}
                aria-label={$t("button.refresh")}
            >
                <IconRefresh />
            </button>
        </header>

        <section id="service-filters">
            {#each services as service}
                <button
                    class="service-filter"
                    class:active={selectedService === service}
                    on:click={() => filterByService(service)}
                >
                    {service}
                </button>
            {/each}
        </section>

        {#if loading && entries.length === 0}
            <div id="loading-state">
                <p>{$t("downloads.loading")}</p>
            </div>
        {:else if error}
            <div id="error-state">
                <p>{error}</p>
                <button class="button" on:click={() => loadDownloads(true)}>
                    {$t("button.retry")}
                </button>
            </div>
        {:else if entries.length === 0}
            <div id="empty-state">
                <IconFolder />
                <p>{$t("downloads.empty")}</p>
            </div>
        {:else}
            <section id="downloads-list">
                {#each entries as entry}
                    <div class="download-item">
                        <button
                            type="button"
                            class="preview-thumb"
                            on:click={() => openPreview(entry)}
                            aria-label={`Preview ${entry.filename}`}
                        >
                            {#if entry.thumbnailUrl}
                                <img src={archiveThumbnail(entry.id)} alt={entry.filename} loading="lazy" />
                            {:else}
                                <span>{entry.kind === "video" ? "VIDEO" : entry.kind === "audio" ? "AUDIO" : "FILE"}</span>
                            {/if}
                            {#if entry.kind === "video"}
                                <span class="play-badge"><IconPlayerPlay /></span>
                            {/if}
                        </button>

                        <div class="download-info">
                            <span class="service-badge">{entry.service}</span>
                            <button type="button" class="filename" on:click={() => openPreview(entry)}>
                                {entry.filename}
                            </button>
                            <div class="meta">
                                <span class="size">{formatFileSize(entry.size)}</span>
                                <span class="date">{formatDate(entry.createdAt)}</span>
                            </div>
                        </div>
                        <a
                            href={downloadArchiveFile(entry.id)}
                            class="button download-button"
                            download={entry.filename}
                        >
                            <IconDownload />
                        </a>
                    </div>
                {/each}
            </section>

            {#if hasMore}
                <button
                    class="button load-more"
                    on:click={loadMore}
                    disabled={loading}
                >
                    {loading ? $t("downloads.loading") : $t("downloads.load_more")}
                </button>
            {/if}
        {/if}

        {#if previewEntry}
            <button type="button" class="preview-backdrop" on:click={closePreview} aria-label="Close preview"></button>
            <div class="preview-modal" role="dialog" aria-modal="true" aria-label="Media preview">
                <div class="preview-header">
                    <strong>{previewEntry.filename}</strong>
                    <button type="button" class="button icon-button" on:click={closePreview} aria-label="Close preview">
                        <IconX />
                    </button>
                </div>

                {#if previewEntry.kind === "video"}
                    <video
                        class="preview-player"
                        controls
                        preload="metadata"
                        src={streamArchiveFile(previewEntry.id)}
                    ></video>
                {:else if previewEntry.kind === "audio"}
                    {#if previewEntry.thumbnailUrl}
                        <img class="preview-cover" src={archiveThumbnail(previewEntry.id)} alt={previewEntry.filename} />
                    {/if}
                    <audio
                        class="preview-audio"
                        controls
                        preload="metadata"
                        src={streamArchiveFile(previewEntry.id)}
                    ></audio>
                {/if}

                <a class="button preview-open-source" href={streamArchiveFile(previewEntry.id)} target="_blank" rel="noreferrer">
                    open stream source
                </a>
            </div>
        {/if}
    </main>
</div>

<style>
    #downloads-page-wrapper {
        display: flex;
        width: 100%;
        height: max-content;
        justify-content: center;
        overflow-y: scroll;
        overflow-x: hidden;
        padding: var(--padding);
    }

    #downloads-page {
        max-width: 100%;
        width: 900px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    #downloads-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 12px;
    }

    #downloads-header h1 {
        font-size: 24px;
        font-weight: 600;
    }

    #service-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 12px;
    }

    .service-filter {
        padding: 6px 12px;
        border-radius: var(--border-radius);
        background: var(--button);
        border: none;
        cursor: pointer;
        font-size: 13px;
        text-transform: lowercase;
        transition: all 0.2s;
    }

    .service-filter:hover {
        background: var(--button-hover);
    }

    .service-filter.active {
        background: var(--secondary);
        color: var(--primary);
    }

    #downloads-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .download-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--button);
        border-radius: var(--border-radius);
        gap: 12px;
    }

    .preview-thumb {
        height: 64px;
        width: 114px;
        border: none;
        border-radius: 10px;
        overflow: hidden;
        background: var(--bg);
        color: var(--gray);
        font-size: 11px;
        position: relative;
        flex-shrink: 0;
        cursor: pointer;
    }

    .preview-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .play-badge {
        position: absolute;
        right: 6px;
        bottom: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: color-mix(in srgb, black 60%, transparent);
        color: white;
    }

    .play-badge :global(svg) {
        width: 14px;
        height: 14px;
    }

    .download-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
    }

    .service-badge {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--gray);
        font-weight: 500;
    }

    .filename {
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        border: none;
        background: none;
        color: inherit;
        text-align: left;
        padding: 0;
        cursor: pointer;
    }

    .meta {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: var(--gray);
    }

    .download-button {
        padding: 8px;
        flex-shrink: 0;
    }

    .download-button :global(svg) {
        width: 20px;
        height: 20px;
    }

    .preview-backdrop {
        position: fixed;
        inset: 0;
        background: var(--dialog-backdrop);
        border: none;
        z-index: 90;
    }

    .preview-modal {
        position: fixed;
        z-index: 91;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(860px, calc(100vw - 24px));
        background: var(--popup-bg);
        border-radius: 14px;
        box-shadow: 0 0 0 1px var(--popup-stroke) inset;
        padding: 12px;
        display: grid;
        gap: 10px;
    }

    .preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .preview-player {
        width: 100%;
        max-height: 70vh;
        background: black;
        border-radius: 10px;
    }

    .preview-audio {
        width: 100%;
    }

    .preview-cover {
        width: 100%;
        max-height: 55vh;
        object-fit: contain;
        border-radius: 10px;
        background: var(--bg);
    }

    .preview-open-source {
        justify-self: start;
    }

    #loading-state,
    #error-state,
    #empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 60px 20px;
        text-align: center;
    }

    #empty-state :global(svg) {
        width: 48px;
        height: 48px;
        stroke-width: 1.5;
        opacity: 0.5;
    }

    .load-more {
        margin-top: 10px;
        padding: 12px;
        width: 100%;
    }

    @media screen and (max-width: 760px) {
        #downloads-page {
            gap: 15px;
        }

        .download-item {
            padding: 10px 12px;
        }

        .preview-thumb {
            width: 88px;
            height: 56px;
        }
    }
</style>
