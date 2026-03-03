<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { backgroundJobs } from "$lib/state/background-jobs";
    import {
        cancelBackgroundJob,
        retryBackgroundJob,
        type ArchiveJob,
    } from "$lib/api/archive";

    import IconX from "@tabler/icons-svelte/IconX.svelte";
    import IconRefresh from "@tabler/icons-svelte/IconRefresh.svelte";
    import IconPlayerPlay from "@tabler/icons-svelte/IconPlayerPlay.svelte";
    import IconFolder from "@tabler/icons-svelte/IconFolder.svelte";

    let expandedJobs = new Set<string>();

    const formatBytes = (bytes: number) => {
        if (!bytes) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const toggleExpand = (jobId: string) => {
        if (expandedJobs.has(jobId)) {
            expandedJobs.delete(jobId);
        } else {
            expandedJobs.add(jobId);
        }
        expandedJobs = expandedJobs;
    };

    const getStatusColor = (state: string) => {
        switch (state) {
            case "done":
                return "var(--green)";
            case "error":
            case "canceled":
                return "var(--red)";
            case "running":
                return "var(--accent)";
            default:
                return "var(--gray)";
        }
    };

    const handleCancel = async (job: ArchiveJob) => {
        await cancelBackgroundJob(job.id);
    };

    const handleRetry = async (job: ArchiveJob) => {
        await retryBackgroundJob(job.id);
    };

    onMount(() => {
        backgroundJobs.fetchJobs(true);
        backgroundJobs.connectSSE();
    });

    onDestroy(() => {
        backgroundJobs.disconnect();
    });
</script>

<div id="background-jobs-panel">
    <div class="panel-header">
        <h3>{$t("jobs.title")}</h3>
        <div class="header-actions">
            <button
                type="button"
                class="icon-button"
                on:click={() => backgroundJobs.fetchJobs(true)}
                disabled={$backgroundJobs.loading}
                aria-label={$t("button.refresh")}
            >
                <IconRefresh />
            </button>
        </div>
    </div>

    <div class="jobs-list">
        {#if $backgroundJobs.jobs.length === 0}
            <div class="empty-state">
                <IconFolder />
                <p>{$t("jobs.empty")}</p>
            </div>
        {:else}
            {#each $backgroundJobs.jobs as job}
                <div class="job-item" class:expanded={expandedJobs.has(job.id)}>
                    <button
                        type="button"
                        class="job-header"
                        on:click={() => job.children?.length && toggleExpand(job.id)}
                    >
                        <div class="job-info">
                            <span class="service-badge">{job.service || "unknown"}</span>
                            <span class="filename">{job.filename || "Untitled"}</span>
                            <span class="timestamp">{formatDate(job.createdAt)}</span>
                        </div>

                        <div class="job-status">
                            <span class="status-badge" style:color={getStatusColor(job.state)}>
                                {job.state}
                            </span>
                            {#if job.children}
                                <span class="child-count">({job.children.length})</span>
                            {/if}
                        </div>
                    </button>

                    {#if job.state === "running" || job.state === "queued"}
                        <div class="progress-bar" class:indeterminate={!job.progress.bytesTotal}>
                            <div
                                class="progress-fill"
                                style:width="{job.progress.bytesTotal ? job.progress.percent : 35}%"
                            ></div>
                        </div>
                        {#if job.progress.bytesTotal}
                            <span class="progress-text">
                                {formatBytes(job.progress.bytesDownloaded)} / {formatBytes(job.progress.bytesTotal)}
                            </span>
                        {:else if job.state === "running"}
                            <span class="progress-text">processing...</span>
                        {/if}
                    {/if}

                    {#if job.error}
                        <div class="error-message">{job.error}</div>
                    {/if}

                    <div class="job-actions">
                        {#if job.state === "running" || job.state === "queued"}
                            <button type="button" class="action-button" on:click={() => handleCancel(job)}>
                                {$t("button.cancel")}
                            </button>
                        {/if}
                        {#if job.state === "error" || job.state === "canceled"}
                            <button type="button" class="action-button" on:click={() => handleRetry(job)}>
                                {$t("button.retry")}
                            </button>
                        {/if}
                        {#if job.state === "done"}
                            <a href="/downloads" class="action-button">
                                {$t("jobs.open_in_downloads")}
                            </a>
                        {/if}
                    </div>

                    {#if job.children && expandedJobs.has(job.id)}
                        <div class="children-list">
                            {#each job.children as child}
                                <div class="child-item">
                                    <span class="child-filename">{child.filename}</span>
                                    <span
                                        class="child-status"
                                        style:color={getStatusColor(child.state)}
                                    >
                                        {child.state}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>

    {#if $backgroundJobs.hasMore}
        <button
            type="button"
            class="load-more"
            on:click={() => backgroundJobs.fetchJobs(false)}
            disabled={$backgroundJobs.loading}
        >
            {$backgroundJobs.loading ? $t("jobs.loading") : $t("jobs.load_more")}
        </button>
    {/if}
</div>

<style>
    #background-jobs-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        background: var(--button);
        border-radius: var(--border-radius);
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .panel-header h3 {
        margin: 0;
        font-size: 16px;
    }

    .header-actions {
        display: flex;
        gap: 8px;
    }

    .icon-button {
        background: none;
        border: none;
        padding: 6px;
        cursor: pointer;
        color: var(--secondary);
    }

    .icon-button :global(svg) {
        width: 18px;
        height: 18px;
    }

    .jobs-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 400px;
        overflow-y: auto;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px 20px;
        color: var(--gray);
        text-align: center;
    }

    .empty-state :global(svg) {
        width: 40px;
        height: 40px;
        margin-bottom: 12px;
        opacity: 0.5;
    }

    .job-item {
        background: var(--bg);
        border-radius: 10px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .job-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        width: 100%;
        text-align: left;
    }

    .job-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
    }

    .service-badge {
        font-size: 10px;
        text-transform: uppercase;
        color: var(--gray);
        font-weight: 500;
    }

    .filename {
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .timestamp {
        font-size: 11px;
        color: var(--gray);
    }

    .job-status {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .status-badge {
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
    }

    .child-count {
        font-size: 11px;
        color: var(--gray);
    }

    .progress-bar {
        height: 4px;
        background: var(--button);
        border-radius: 2px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: var(--accent);
        transition: width 0.3s ease;
    }

    .progress-bar.indeterminate .progress-fill {
        width: 35% !important;
        animation: panel-progress-indeterminate 1.2s ease-in-out infinite;
    }

    .progress-text {
        font-size: 11px;
        color: var(--gray);
    }

    .error-message {
        font-size: 12px;
        color: var(--red);
        padding: 6px;
        background: color-mix(in srgb, var(--red) 10%, var(--button));
        border-radius: 6px;
    }

    .job-actions {
        display: flex;
        gap: 8px;
    }

    .action-button {
        font-size: 12px;
        padding: 6px 12px;
        background: var(--button);
        border: none;
        border-radius: 6px;
        color: var(--secondary);
        cursor: pointer;
        text-decoration: none;
    }

    .action-button:hover {
        background: var(--button-hover);
    }

    .children-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 8px;
        border-top: 1px solid var(--button);
    }

    .child-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        padding: 4px 8px;
    }

    .child-filename {
        color: var(--secondary);
    }

    .child-status {
        font-size: 10px;
        text-transform: uppercase;
    }

    .load-more {
        padding: 10px;
        background: var(--button);
        border: none;
        border-radius: var(--border-radius);
        color: var(--secondary);
        cursor: pointer;
    }

    @keyframes panel-progress-indeterminate {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(280%);
        }
    }
</style>
