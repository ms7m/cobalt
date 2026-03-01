<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import {
        getArchiveConfig,
        setArchiveConfig,
        setServiceDirectory,
        type ArchiveConfig
    } from "$lib/api/archive";

    import SettingsCategory from "$components/settings/SettingsCategory.svelte";
    import IconFolder from "@tabler/icons-svelte/IconFolder.svelte";
    import IconTrash from "@tabler/icons-svelte/IconTrash.svelte";
    import IconPlus from "@tabler/icons-svelte/IconPlus.svelte";

    type MappingDialogMode = "add" | "edit";

    let config: ArchiveConfig | null = null;
    let loading = true;
    let saving = false;

    let dialogOpen = false;
    let dialogMode: MappingDialogMode = "add";
    let dialogService = "";
    let dialogDirectory = "";

    const services = [
        "youtube",
        "twitter",
        "instagram",
        "tiktok",
        "soundcloud",
        "vimeo",
        "reddit",
        "twitch",
        "bilibili"
    ];

    const suggestedDirectories = [
        "videos",
        "music",
        "shorts",
        "social",
        "clips",
        "podcasts"
    ];

    onMount(async () => {
        await loadConfig();
    });

    const loadConfig = async () => {
        loading = true;
        config = await getArchiveConfig();
        loading = false;
    };

    const updateRootDir = async (value: string) => {
        if (!config) return;
        saving = true;
        await setArchiveConfig({ archiveRoot: value });
        await loadConfig();
        saving = false;
    };

    const setQuickMapping = async (service: string, directory: string) => {
        saving = true;
        await setServiceDirectory(service, directory);
        await loadConfig();
        saving = false;
    };

    const removeServiceMapping = async (service: string) => {
        saving = true;
        await setServiceDirectory(service, null);
        await loadConfig();
        saving = false;
    };

    const activeMappings = () => Object.entries(config?.serviceDirs || {});

    const availableServices = () => services.filter((service) => !config?.serviceDirs?.[service]);

    const resolvedDirectory = (service: string) => config?.serviceDirs?.[service] || service;

    const fullPathFor = (service: string, directory: string) => {
        const root = config?.archiveRoot || "/archive";
        const safeService = service || "service";
        const safeDir = directory || safeService;
        return `${root}/${safeDir}`;
    };

    const openAddDialog = () => {
        const [firstAvailableService] = availableServices();
        dialogMode = "add";
        dialogService = firstAvailableService || "";
        dialogDirectory = firstAvailableService || "";
        dialogOpen = true;
    };

    const openEditDialog = (service: string, directory: string) => {
        dialogMode = "edit";
        dialogService = service;
        dialogDirectory = directory;
        dialogOpen = true;
    };

    const closeDialog = () => {
        dialogOpen = false;
    };

    const saveDialogMapping = async () => {
        const service = dialogService.trim();
        const directory = dialogDirectory.trim();
        if (!service || !directory) return;

        saving = true;
        await setServiceDirectory(service, directory);
        await loadConfig();
        saving = false;
        closeDialog();
    };
</script>

{#if loading}
    <div class="loading">{$t("settings.storage.loading")}</div>
{:else}
    <SettingsCategory
        sectionId="storage-root"
        title={$t("settings.storage.root_directory")}
    >
        <div class="setting-description">
            {$t("settings.storage.root_description")}
        </div>
        <div class="root-input">
            <input
                type="text"
                value={config?.archiveRoot || ""}
                placeholder="/path/to/archive"
                on:change={(e) => updateRootDir(e.currentTarget.value)}
                disabled={saving}
            />
        </div>
    </SettingsCategory>

    <SettingsCategory
        sectionId="storage-mappings"
        title={$t("settings.storage.service_mappings")}
    >
        <div class="setting-description">
            {$t("settings.storage.mappings_description")}
        </div>

        <div class="quick-mappings">
            <h4>{$t("settings.storage.quick_setup")}</h4>
            <div class="quick-buttons">
                <button
                    class="button"
                    on:click={() => setQuickMapping("soundcloud", "music")}
                    disabled={saving}
                >
                    <IconFolder />
                    {$t("settings.storage.music_services")}
                </button>
            </div>
        </div>

        <div class="mapping-header-row">
            <h4>Custom service mappings</h4>
            <button type="button" class="button" on:click={openAddDialog} disabled={saving || availableServices().length === 0}>
                <IconPlus />
                {$t("button.add")}
            </button>
        </div>

        <div class="mappings-list">
            {#if activeMappings().length === 0}
                <div class="empty-state">No custom mappings yet. Add one to route a service into a specific folder.</div>
            {:else}
                {#each activeMappings() as [service, directory]}
                    <div class="mapping-item">
                        <div class="mapping-info">
                            <div class="mapping-topline">
                                <span class="service-name">{service}</span>
                                <span class="arrow">→</span>
                                <span class="directory">{directory}</span>
                            </div>
                            <code class="mapping-path">{fullPathFor(service, directory)}</code>
                        </div>

                        <div class="mapping-actions">
                            <button
                                type="button"
                                class="button icon-button"
                                on:click={() => openEditDialog(service, directory)}
                                disabled={saving}
                            >
                                Edit
                            </button>
                            <button
                                type="button"
                                class="button icon-button danger"
                                on:click={() => removeServiceMapping(service)}
                                disabled={saving}
                            >
                                <IconTrash />
                            </button>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </SettingsCategory>

    <SettingsCategory
        sectionId="storage-preview"
        title={$t("settings.storage.path_preview")}
    >
        <div class="path-preview">
            <code>{config?.archiveRoot || "/archive"}/<span class="highlight">{resolvedDirectory("youtube")}</span>/filename.mp4</code>
        </div>
    </SettingsCategory>

    {#if dialogOpen}
        <button
            class="modal-backdrop"
            type="button"
            on:click={closeDialog}
            aria-label="Close mapping dialog"
        ></button>
        <div class="mapping-modal" role="dialog" aria-modal="true" aria-label="Service mapping">
            <div class="modal-title-row">
                <h3>{dialogMode === "add" ? "Add service mapping" : "Edit service mapping"}</h3>
            </div>

            <div class="modal-fields">
                <label for="mapping-service">Service</label>
                <select
                    id="mapping-service"
                    bind:value={dialogService}
                    disabled={saving || dialogMode === "edit"}
                >
                    <option value="" disabled>Select service</option>
                    {#if dialogMode === "edit"}
                        <option value={dialogService}>{dialogService}</option>
                    {:else}
                        {#each availableServices() as service}
                            <option value={service}>{service}</option>
                        {/each}
                    {/if}
                </select>

                <label for="mapping-directory">Save folder</label>
                <input
                    id="mapping-directory"
                    type="text"
                    bind:value={dialogDirectory}
                    placeholder="music"
                    disabled={saving}
                />

                <div class="suggested">
                    <span>Suggestions:</span>
                    <div class="suggestion-buttons">
                        {#each suggestedDirectories as directory}
                            <button
                                type="button"
                                class="button chip"
                                on:click={() => (dialogDirectory = directory)}
                                disabled={saving}
                            >
                                {directory}
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="preview-card">
                    <span>Files from <strong>{dialogService || "service"}</strong> will be saved to:</span>
                    <code>{fullPathFor(dialogService, dialogDirectory)}</code>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" class="button" on:click={closeDialog} disabled={saving}>Cancel</button>
                <button
                    type="button"
                    class="button"
                    on:click={saveDialogMapping}
                    disabled={!dialogService || !dialogDirectory.trim() || saving}
                >
                    Save mapping
                </button>
            </div>
        </div>
    {/if}
{/if}

<style>
    .loading {
        padding: 40px;
        text-align: center;
        color: var(--gray);
    }

    .setting-description {
        margin-bottom: 16px;
        color: var(--gray);
        font-size: 14px;
    }

    .root-input input {
        width: 100%;
        padding: 12px 16px;
        border-radius: var(--border-radius);
        border: none;
        background: var(--button);
        color: var(--secondary);
        font-size: 14px;
    }

    .quick-mappings {
        margin-bottom: 20px;
        padding: 16px;
        background: var(--button);
        border-radius: var(--border-radius);
    }

    .quick-mappings h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        font-weight: 500;
    }

    .quick-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .quick-buttons button {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .quick-buttons :global(svg) {
        width: 18px;
        height: 18px;
    }

    .mapping-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        gap: 10px;
    }

    .mapping-header-row h4 {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
    }

    .mapping-header-row button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .mapping-header-row :global(svg) {
        width: 16px;
        height: 16px;
    }

    .mappings-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 8px;
    }

    .empty-state {
        padding: 12px 14px;
        background: var(--button);
        border-radius: var(--border-radius);
        color: var(--gray);
        font-size: 13px;
    }

    .mapping-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        background: var(--button);
        border-radius: var(--border-radius);
    }

    .mapping-info {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        min-width: 0;
    }

    .mapping-topline {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .service-name {
        font-weight: 500;
        text-transform: uppercase;
        font-size: 12px;
    }

    .arrow {
        color: var(--gray);
    }

    .directory {
        font-family: monospace;
        font-size: 13px;
    }

    .mapping-path {
        font-family: monospace;
        font-size: 12px;
        color: var(--gray);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: min(65vw, 480px);
    }

    .mapping-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .icon-button {
        min-width: auto;
        padding: 8px 10px;
    }

    .icon-button.danger {
        color: var(--red);
    }

    .icon-button :global(svg) {
        width: 16px;
        height: 16px;
    }

    .path-preview {
        padding: 16px;
        background: var(--button);
        border-radius: var(--border-radius);
        overflow-x: auto;
    }

    .path-preview code {
        font-family: monospace;
        font-size: 13px;
        color: var(--secondary);
    }

    .path-preview .highlight {
        color: var(--accent);
        font-weight: 500;
    }

    .modal-backdrop {
        position: fixed;
        inset: 0;
        border: none;
        padding: 0;
        background: var(--dialog-backdrop);
        cursor: pointer;
        z-index: 90;
    }

    .mapping-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(560px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        overflow-y: auto;
        z-index: 91;
        border-radius: 18px;
        background: var(--popup-bg);
        box-shadow: 0 0 0 1px var(--popup-stroke) inset;
        padding: 16px;
    }

    .modal-title-row h3 {
        margin: 0 0 14px 0;
        color: var(--secondary);
        font-size: 17px;
    }

    .modal-fields {
        display: grid;
        gap: 8px;
    }

    .modal-fields label {
        font-size: 13px;
        color: var(--gray);
    }

    .modal-fields input,
    .modal-fields select {
        width: 100%;
        padding: 10px 12px;
        border-radius: var(--border-radius);
        border: none;
        background: var(--button);
        color: var(--secondary);
        font-size: 14px;
    }

    .suggested {
        display: grid;
        gap: 8px;
        margin-top: 6px;
    }

    .suggested > span {
        color: var(--gray);
        font-size: 12px;
    }

    .suggestion-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .chip {
        font-size: 12px;
        padding: 7px 10px;
    }

    .preview-card {
        margin-top: 8px;
        border-radius: var(--border-radius);
        background: var(--button);
        padding: 10px 12px;
        display: grid;
        gap: 6px;
        font-size: 13px;
        color: var(--gray);
    }

    .preview-card code {
        color: var(--secondary);
        font-family: monospace;
        font-size: 12px;
    }

    .modal-actions {
        margin-top: 14px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    @media screen and (max-width: 760px) {
        .mapping-item {
            align-items: flex-start;
            flex-direction: column;
        }

        .mapping-actions {
            width: 100%;
            justify-content: flex-end;
        }

        .mapping-path {
            max-width: calc(100vw - 80px);
        }

        .modal-actions {
            justify-content: stretch;
        }

        .modal-actions button {
            flex: 1;
        }
    }
</style>
