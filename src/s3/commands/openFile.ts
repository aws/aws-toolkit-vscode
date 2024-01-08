/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FileViewerManager } from '../fileViewerManager'
import { downloadFileAsCommand } from './downloadFileAs'
import { telemetry } from '../../shared/telemetry/telemetry'

const sizeLimit = 50 * Math.pow(10, 6)

export async function openFileReadModeCommand(node: S3FileNode, manager: S3FileViewerManager): Promise<void> {
    if (await isFileSizeValid(node.file.sizeBytes, node)) {
        return telemetry.s3_openEditor.run(() => manager.openInReadMode({ bucket: node.bucket, ...node.file }))
    }
}

export async function editFileCommand(uriOrNode: vscode.Uri | S3FileNode, manager: S3FileViewerManager): Promise<void> {
    if (uriOrNode instanceof S3FileNode) {
        const size = uriOrNode.file.sizeBytes

        if (!(await isFileSizeValid(size, uriOrNode))) {
            return
        }

        return telemetry.s3_editObject.run(() =>
            manager.openInEditMode({ bucket: uriOrNode.bucket, ...uriOrNode.file })
        )
    }

    return telemetry.s3_editObject.run(() => manager.openInEditMode(uriOrNode))
}

async function isFileSizeValid(size: number | undefined, fileNode: S3FileNode): Promise<boolean> {
    if (size && size > sizeLimit) {
        const downloadAs = localize('AWS.s3.button.downloadAs', 'Download as..')
        void vscode.window
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
