<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { beforeNavigate, onNavigate } from "$app/navigation";

    import { clearFileStorage } from "$lib/storage/opfs";

    import { getProgress } from "$lib/task-manager/queue";
    import { queueVisible } from "$lib/state/queue-visibility";
    import { currentTasks } from "$lib/state/task-manager/current-tasks";
    import { clearQueue, queue as readableQueue } from "$lib/state/task-manager/queue";
    import { backgroundJobs } from "$lib/state/background-jobs";
    import { cancelBackgroundJob } from "$lib/api/archive";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
    import PopoverContainer from "$components/misc/PopoverContainer.svelte";
    import ProcessingStatus from "$components/queue/ProcessingStatus.svelte";
    import ProcessingQueueItem from "$components/queue/ProcessingQueueItem.svelte";
    import ProcessingQueueStub from "$components/queue/ProcessingQueueStub.svelte";
    import IconX from "@tabler/icons-svelte/IconX.svelte";
    import IconCloud from "@tabler/icons-svelte/IconCloud.svelte";

    const popoverAction = () => {
        $queueVisible = !$queueVisible;
    };

    let queue = $derived(Object.entries($readableQueue));
    let bgJobs = $derived($backgroundJobs.jobs);
    
    let hasBackgroundJobs = $derived(bgJobs.length > 0);
    let activeBgJobs = $derived(bgJobs.filter(j => j.state === 'running' || j.state === 'queued'));
    
    let totalProgress = $derived(() => {
        const localCount = queue.length;
        const bgCount = activeBgJobs.length;
        const totalCount = localCount + bgCount;
        
        if (!totalCount) return 0;
        
        let localProgress = 0;
        if (localCount) {
            localProgress = queue.map(([, item]) => getProgress(item, $currentTasks) * 100)
                .reduce((a, b) => a + b, 0) / (100 * localCount);
        }
        
        let bgProgress = 0;
        if (bgCount) {
            bgProgress = activeBgJobs.map(j => j.progress?.percent || 0)
                .reduce((a, b) => a + b, 0) / (100 * bgCount);
        }
        
        return ((localProgress * localCount) + (bgProgress * bgCount)) / totalCount;
    });

    let indeterminate = $derived(queue.length > 0 && totalProgress() === 0);

    onNavigate(() => {
        $queueVisible = false;
    });

    onMount(() => {
        clearFileStorage();
        backgroundJobs.fetchJobs(true);
        backgroundJobs.connectSSE();
    });

    onDestroy(() => {
        backgroundJobs.disconnect();
    });

    beforeNavigate((event) => {
        if (event.type === "leave" && (totalProgress() > 0 && totalProgress() < 1)) {
            event.cancel();
        }
    });

    const formatBytes = (bytes: number) => {
        if (!bytes) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };
</script>

<div id="processing-queue">
    <ProcessingStatus
        progress={totalProgress() * 100}
        {indeterminate}
        expandAction={popoverAction}
    />

    <PopoverContainer
        id="processing-popover"
        expanded={$queueVisible}
        expandStart="right"
    >
        <div id="processing-header">
            <div class="header-top">
                <SectionHeading
                    title={$t("queue.title")}
                    sectionId="queue"
                    beta
                    nolink
                />
                <div class="header-buttons">
                    {#if queue.length}
                        <button
                            class="clear-button"
                            onclick={clearQueue}
                            tabindex={!$queueVisible ? -1 : undefined}
                        >
                            <IconX />
                            {$t("button.clear")}
                        </button>
                    {/if}
                </div>
            </div>
        </div>

        <div id="processing-list" role="list" aria-labelledby="queue-title">
            <!-- Local processing items -->
            {#each queue as [id, item]}
                <ProcessingQueueItem {id} info={item} />
            {/each}
            
            <!-- Background jobs section -->
            {#if hasBackgroundJobs}
                <div class="bg-jobs-section">
                    <div class="bg-jobs-header">
                        <IconCloud />
                        <span>NAS Downloads</span>
                        {#if activeBgJobs.length > 0}
                            <span class="bg-badge">{activeBgJobs.length}</span>
                        {/if}
                    </div>
                    
                    {#each bgJobs.slice(0, 5) as job}
                        <div class="bg-job-item" class:done={job.state === 'done'} class:error={job.state === 'error'}>
                            <div class="bg-job-info">
                                <span class="bg-job-service">{job.service || 'unknown'}</span>
                                <span class="bg-job-filename">{job.filename || 'Untitled'}</span>
                            </div>
                            <div class="bg-job-status">
                                {#if job.state === 'running'}
                                    <div class="bg-progress-bar">
                                        <div class="bg-progress-fill" style:width="{job.progress?.percent || 0}%" />
                                    </div>
                                    <span class="bg-progress-text">{job.progress?.percent || 0}%</span>
                                {:else if job.state === 'done'}
                                    <span class="bg-status-done">✓</span>
                                {:else if job.state === 'error'}
                                    <span class="bg-status-error">✗</span>
                                {:else}
                                    <span class="bg-status-queued">⋯</span>
                                {/if}
                                
                                {#if job.state === 'running' || job.state === 'queued'}
                                    <button 
                                        class="bg-cancel-btn"
                                        onclick={() => cancelBackgroundJob(job.id)}
                                    >
                                        <IconX />
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                    
                    {#if bgJobs.length > 5}
                        <a href="/downloads" class="bg-view-all">
                            View all {bgJobs.length} downloads →
                        </a>
                    {/if}
                </div>
            {/if}
            
            {#if queue.length === 0 && !hasBackgroundJobs}
                <ProcessingQueueStub />
            {/if}
        </div>
    </PopoverContainer>
</div>

<style>
    #processing-queue {
        --holder-padding: 12px;
        position: absolute;
        right: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: end;
        z-index: 9;
        pointer-events: none;
        padding: var(--holder-padding);
        width: calc(100% - var(--holder-padding) * 2);
    }

    #processing-queue :global(#processing-popover) {
        gap: 12px;
        padding: 16px;
        padding-bottom: 0;
        width: calc(100% - 16px * 2);
        max-width: 425px;
    }

    #processing-header {
        display: flex;
        flex-direction: column;
        flex-wrap: wrap;
        gap: 3px;
    }

    .header-top {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
    }

    .header-buttons {
        display: flex;
        flex-direction: row;
        gap: var(--padding);
    }

    .header-buttons button {
        font-size: 13px;
        font-weight: 500;
        padding: 0;
        background: none;
        box-shadow: none;
        text-align: left;
        border-radius: 3px;
        outline-offset: 5px;
    }

    .header-buttons button :global(svg) {
        height: 16px;
        width: 16px;
    }

    .clear-button {
        color: var(--medium-red);
    }

    #processing-list {
        display: flex;
        flex-direction: column;
        max-height: 65vh;
        overflow-y: scroll;
        overflow-x: hidden;
    }

    .bg-jobs-section {
        border-top: 1px solid var(--button);
        margin-top: 8px;
        padding-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .bg-jobs-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 500;
        color: var(--secondary);
        padding: 0 4px;
    }

    .bg-jobs-header :global(svg) {
        width: 16px;
        height: 16px;
    }

    .bg-badge {
        background: var(--accent);
        color: var(--primary);
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 10px;
        margin-left: auto;
    }

    .bg-job-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 12px;
        background: var(--button);
        border-radius: 8px;
    }

    .bg-job-item.done {
        opacity: 0.7;
    }

    .bg-job-item.error {
        background: color-mix(in srgb, var(--red) 10%, var(--button));
    }

    .bg-job-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .bg-job-service {
        font-size: 10px;
        text-transform: uppercase;
        color: var(--gray);
    }

    .bg-job-filename {
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .bg-job-status {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
    }

    .bg-progress-bar {
        flex: 1;
        height: 3px;
        background: var(--bg);
        border-radius: 2px;
        overflow: hidden;
    }

    .bg-progress-fill {
        height: 100%;
        background: var(--accent);
        transition: width 0.3s ease;
    }

    .bg-progress-text {
        font-size: 10px;
        color: var(--gray);
        min-width: 32px;
        text-align: right;
    }

    .bg-status-done {
        color: var(--green);
        font-size: 12px;
    }

    .bg-status-error {
        color: var(--red);
        font-size: 12px;
    }

    .bg-status-queued {
        color: var(--gray);
        font-size: 12px;
    }

    .bg-cancel-btn {
        background: none;
        border: none;
        padding: 2px;
        cursor: pointer;
        color: var(--gray);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .bg-cancel-btn :global(svg) {
        width: 14px;
        height: 14px;
    }

    .bg-cancel-btn:hover {
        color: var(--red);
    }

    .bg-view-all {
        font-size: 12px;
        color: var(--accent);
        text-decoration: none;
        padding: 8px 12px;
        text-align: center;
        border-radius: 6px;
        background: var(--button);
    }

    .bg-view-all:hover {
        background: var(--button-hover);
    }

    @media screen and (max-width: 535px) {
        #processing-queue {
            --holder-padding: 8px;
            padding-top: 4px;
            top: env(safe-area-inset-top);
        }
    }
</style>
