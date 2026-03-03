<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { listBackgroundJobs, type ArchiveJob } from "$lib/api/archive";

    import IconRefresh from "@tabler/icons-svelte/IconRefresh.svelte";

    const POLL_MS = 5000;

    let loading = true;
    let error: string | null = null;
    let pendingJobs: ArchiveJob[] = [];
    let lastUpdated = "";
    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const formatDate = (iso: string) => {
        if (!iso) {
            return "-";
        }

        return new Date(iso).toLocaleString();
    };

    const formatBytes = (bytes: number) => {
        if (!bytes) {
            return "0 B";
        }

        const units = ["B", "KB", "MB", "GB", "TB"];
        let value = bytes;
        let unit = 0;

        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit += 1;
        }

        return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
    };

    const loadPending = async () => {
        loading = true;
        error = null;

        try {
            const [queued, running] = await Promise.all([
                listBackgroundJobs({ state: "queued", limit: 100 }),
                listBackgroundJobs({ state: "running", limit: 100 }),
            ]);

            const all = [...(running?.jobs || []), ...(queued?.jobs || [])];
            pendingJobs = all.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
            lastUpdated = new Date().toISOString();
        } catch {
            error = "Could not load pending statuses";
        } finally {
            loading = false;
        }
    };

    onMount(() => {
        loadPending();
        pollHandle = setInterval(loadPending, POLL_MS);

        return () => {
            if (pollHandle) {
                clearInterval(pollHandle);
            }
        };
    });
</script>

<svelte:head>
    <title>{$t("pending.title")} ~ {$t("general.cobalt")}</title>
</svelte:head>

<div class="pending-wrapper">
    <main class="pending-page">
        <header class="pending-header">
            <div>
                <h1>{$t("pending.title")}</h1>
                <p>{$t("pending.subtitle")}</p>
            </div>
            <button type="button" class="button icon-button" on:click={loadPending} disabled={loading}>
                <IconRefresh />
                {$t("pending.refresh")}
            </button>
        </header>

        {#if lastUpdated}
            <p class="updated-at">{$t("pending.updated")}: {formatDate(lastUpdated)}</p>
        {/if}

        {#if loading && pendingJobs.length === 0}
            <div class="card">{$t("downloads.loading")}</div>
        {:else if error}
            <div class="card error">{error}</div>
        {:else if pendingJobs.length === 0}
            <div class="card">{$t("pending.empty")}</div>
        {:else}
            <section class="pending-list">
                {#each pendingJobs as job}
                    <article class="pending-item" class:queued={job.state === "queued"}>
                        <div class="item-top">
                            <span class="service">{job.service || $t("pending.unknown")}</span>
                            <span class="state" class:running={job.state === "running"}>
                                {job.state === "running" ? $t("pending.running") : $t("pending.queued")}
                            </span>
                        </div>

                        <p class="filename">{job.filename || job.id}</p>

                        {#if job.state === "running"}
                            <div class="progress-track" class:indeterminate={!job.progress.bytesTotal}>
                                <div
                                    class="progress-fill"
                                    style:width={`${job.progress.bytesTotal ? job.progress.percent : 35}%`}
                                ></div>
                            </div>
                            <p class="progress-text">
                                {#if job.progress.bytesTotal}
                                    {job.progress.percent}% - {formatBytes(job.progress.bytesDownloaded)} / {formatBytes(job.progress.bytesTotal)}
                                {:else}
                                    {formatBytes(job.progress.bytesDownloaded)} downloaded
                                {/if}
                            </p>
                        {/if}

                        <p class="timestamps">created: {formatDate(job.createdAt)} - updated: {formatDate(job.updatedAt)}</p>
                    </article>
                {/each}
            </section>
        {/if}
    </main>
</div>

<style>
    .pending-wrapper {
        width: 100%;
        display: flex;
        justify-content: center;
        padding: var(--padding);
    }

    .pending-page {
        width: min(920px, 100%);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .pending-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
    }

    .pending-header h1 {
        margin: 0;
        font-size: 24px;
    }

    .pending-header p {
        margin: 4px 0 0;
        color: var(--gray);
        font-size: 13px;
    }

    .icon-button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
    }

    .icon-button :global(svg) {
        width: 18px;
        height: 18px;
    }

    .updated-at {
        margin: 0;
        color: var(--gray);
        font-size: 12px;
    }

    .card {
        margin: 0;
        padding: 18px;
        border-radius: var(--border-radius);
        background: var(--button);
    }

    .card.error {
        color: var(--red);
        background: color-mix(in srgb, var(--red) 10%, var(--button));
    }

    .pending-list {
        display: grid;
        gap: 10px;
    }

    .pending-item {
        padding: 14px;
        border-radius: var(--border-radius);
        background: var(--button);
        display: grid;
        gap: 8px;
    }

    .pending-item.queued {
        opacity: 0.9;
    }

    .item-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
    }

    .service {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--gray);
    }

    .state {
        font-size: 11px;
        color: var(--gray);
    }

    .state.running {
        color: var(--accent);
    }

    .filename {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
        word-break: break-word;
    }

    .progress-track {
        height: 5px;
        background: var(--bg);
        border-radius: 999px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: var(--accent);
        transition: width 0.25s ease;
    }

    .progress-track.indeterminate .progress-fill {
        width: 35% !important;
        animation: pending-progress-indeterminate 1.2s ease-in-out infinite;
    }

    .progress-text,
    .timestamps {
        margin: 0;
        color: var(--gray);
        font-size: 12px;
    }

    @keyframes pending-progress-indeterminate {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(280%);
        }
    }

    @media (max-width: 700px) {
        .pending-header {
            flex-direction: column;
            align-items: flex-start;
        }
    }
</style>
