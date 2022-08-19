/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getTelemetryResult } from '../../shared/errors'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FileViewerManager, TabMode } from '../fileViewerManager'
import { downloadFileAsCommand } from './downloadFileAs'
import { telemetry } from '../../shared/telemetry/spans'
import { Result } from '../../shared/telemetry/telemetry'

const SIZE_LIMIT = 50 * Math.pow(10, 6)

export async function openFileReadModeCommand(node: S3FileNode, manager: S3FileViewerManager): Promise<void> {
    if (await isFileSizeValid(node.file.sizeBytes, node)) {
        return runWithTelemetry(() => manager.openInReadMode({ bucket: node.bucket, ...node.file }), TabMode.Read)
    }
}

export async function editFileCommand(uriOrNode: vscode.Uri | S3FileNode, manager: S3FileViewerManager): Promise<void> {
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
    // TODO: these metrics shouldn't be separate. A single one with a 'mode' field would work fine.
    const recordMetric = (result: Result) =>
        mode === TabMode.Read ? telemetry.s3_openEditor.emit({ result }) : telemetry.s3_editObject.emit({ result })

    return fn()
        .then(() => recordMetric('Succeeded'))
        .catch(err => {
            recordMetric(getTelemetryResult(err))
            throw err
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
