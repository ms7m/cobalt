<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import {
        listArchiveDownloads,
        downloadArchiveFile,
        type ArchiveEntry
    } from "$lib/api/archive";

    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconFolder from "@tabler/icons-svelte/IconFolder.svelte";
    import IconRefresh from "@tabler/icons-svelte/IconRefresh.svelte";

    let entries: ArchiveEntry[] = [];
    let loading = true;
    let error: string | null = null;
    let hasMore = false;
    let cursor = 0;
    let selectedService = "";

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
                        <div class="download-info">
                            <span class="service-badge">{entry.service}</span>
                            <span class="filename">{entry.filename}</span>
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
    }
</style>
