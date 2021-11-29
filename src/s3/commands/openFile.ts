/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FileViewerManager } from '../fileViewerManager'
import { downloadFileAsCommand } from './downloadFileAs'

const SIZE_LIMIT = 50 * Math.pow(10, 6)

// TODO: add telemetry for success/fail/cancelled

export async function openFileCommand(node: S3FileNode, manager: S3FileViewerManager): Promise<void> {
    if (await isFileSizeValid(node.file.sizeBytes, node)) {
        await manager.openInReadMode({ bucket: node.bucket, ...node.file })
    }
}

export async function openFileEditModeCommand(
    uriOrNode: vscode.Uri | S3FileNode,
    manager: S3FileViewerManager
): Promise<void> {
    if (uriOrNode instanceof S3FileNode) {
        const size = uriOrNode.file.sizeBytes

        if (await isFileSizeValid(size, uriOrNode)) {
            await manager.openInEditMode({ bucket: uriOrNode.bucket, ...uriOrNode.file })
        }
    } else {
        return await manager.openInEditMode(uriOrNode)
    }
}

async function isFileSizeValid(
    size: number | undefined,
    fileNode?: S3FileNode,
    window = Window.vscode()
): Promise<boolean> {
    if (!size) {
        return true
    }
    if (size > SIZE_LIMIT) {
        window
            .showErrorMessage(
                localize(
                    'AWS.s3.fileViewer.error.invalidSize',
                    'Files over 50MB currently not supported for file display, use the "Download as..." action'
                ),
                localize('AWS.s3.button.downloadAs', 'Download as..')
            )
            .then(async response => {
                if (response === 'Download as..') {
                    await downloadFileAsCommand(fileNode!)
                }
            })
        return false
    }

    return true
}
