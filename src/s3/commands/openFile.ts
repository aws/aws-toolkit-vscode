/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/toolkitError'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { TimeoutError } from '../../shared/utilities/timeoutUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FileViewerManager, TabMode } from '../fileViewerManager'
import { downloadFileAsCommand } from './downloadFileAs'

const SIZE_LIMIT = 50 * Math.pow(10, 6)

export async function openFileReadModeCommand(node: S3FileNode, manager: S3FileViewerManager): Promise<void> {
    if (await isFileSizeValid(node.file.sizeBytes, node)) {
        return runWithTelemetry(() => manager.openInReadMode({ bucket: node.bucket, ...node.file }), TabMode.Read)
    }
}

export async function openFileEditModeCommand(
    uriOrNode: vscode.Uri | S3FileNode,
    manager: S3FileViewerManager
): Promise<void> {
    if (uriOrNode instanceof S3FileNode) {
        const size = uriOrNode.file.sizeBytes

        if (!(await isFileSizeValid(size, uriOrNode))) {
            return
        }

        return runWithTelemetry(
            () => manager.openInEditMode({ bucket: uriOrNode.bucket, ...uriOrNode.file }),
            TabMode.Edit
        )
    }

    return runWithTelemetry(() => manager.openInEditMode(uriOrNode), TabMode.Edit)
}

function runWithTelemetry(fn: () => Promise<void>, mode: TabMode): Promise<void> {
    const recordMetric = (result: telemetry.Result) =>
        mode === TabMode.Read ? telemetry.recordS3OpenEditor({ result }) : telemetry.recordS3EditObject({ result })

    return fn().catch(err => {
        if (TimeoutError.isCancelled(err)) {
            return recordMetric('Cancelled')
        }
        if (!(err instanceof ToolkitError)) {
            throw err
        }

        const result: telemetry.Result = err.cancelled ? 'Cancelled' : 'Failed'
        if (result !== 'Cancelled') {
            if (err.detail) {
                getLogger().error(err.detail)
            }
            showViewLogsMessage(err.message)
        }
        recordMetric(result)
    })
}

async function isFileSizeValid(
    size: number | undefined,
    fileNode: S3FileNode,
    window = Window.vscode()
): Promise<boolean> {
    if (size && size > SIZE_LIMIT) {
        const downloadAs = localize('AWS.s3.button.downloadAs', 'Download as..')
        window
            .showErrorMessage(
                localize(
                    'AWS.s3.fileViewer.error.invalidSize',
                    'Files over 50MB cannot be viewed and instead must be downloaded manually.'
                ),
                downloadAs
            )
            .then(async response => {
                if (response === downloadAs) {
                    await downloadFileAsCommand(fileNode)
                }
            })
        return false
    }

    return true
}
