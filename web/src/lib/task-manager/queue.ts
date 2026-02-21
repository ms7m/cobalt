
import { addItem } from "$lib/state/task-manager/queue";
import { openQueuePopover } from "$lib/state/queue-visibility";
import { uuid } from "$lib/util";

import type { CobaltQueueItem } from "$lib/types/queue";
import type { CobaltCurrentTasks } from "$lib/types/task-manager";
import { resultFileTypes, type CobaltPipelineItem, type CobaltPipelineResultFileType } from "$lib/types/workers";

export const getMediaType = (type: string) => {
    const kind = type.split('/')[0] as CobaltPipelineResultFileType;

    if (resultFileTypes.includes(kind)) {
        return kind;
    }
}

export const createRemuxPipeline = (file: File) => {
    const parentId = uuid();
    const mediaType = getMediaType(file.type);

    const pipeline: CobaltPipelineItem[] = [{
        worker: "remux",
        workerId: uuid(),
        parentId,
        workerArgs: {
            files: [file],
            ffargs: [
                "-c", "copy",
                "-map", "0"
            ],
            output: {
                type: file.type,
                format: file.name.split(".").pop(),
            },
        },
    }];

    if (mediaType) {
        addItem({
            id: parentId,
            state: "waiting",
            pipeline,
            filename: file.name,
            mimeType: file.type,
            mediaType,
        });

        openQueuePopover();
    }
}



export const getProgress = (item: CobaltQueueItem, currentTasks: CobaltCurrentTasks): number => {
    if (item.state === 'done' || item.state === 'error') {
        return 1;
    } else if (item.state === 'waiting') {
        return 0;
    }

    let sum = 0;
    for (const worker of item.pipeline) {
        if (item.pipelineResults[worker.workerId]) {
            sum += 1;
        } else {
            const task = currentTasks[worker.workerId];
            sum += (task?.progress?.percentage || 0) / 100;
        }
    }

    return sum / item.pipeline.length;
}
