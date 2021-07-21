/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
//import { showErrorWithLogs } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FileViewerManager } from '../util/fileViewerManager'
//import { FileViewerManager, SingletonManager } from '../util/fileViewerManager'

const SIZE_LIMIT = 50 * Math.pow(10, 6)
export async function openFileCommand(node: S3FileNode, manager: S3FileViewerManager): Promise<void> {
    if (!sizeLimitPrompt(node)) {
        return
    }
    await manager.openTab(node)
}

export async function openFileEditModeCommand(
    uriOrNode: vscode.Uri | S3FileNode,
    manager: S3FileViewerManager
): Promise<void> {
    if (uriOrNode instanceof S3FileNode && !sizeLimitPrompt(uriOrNode)) {
        return
    }
    manager.openOnEditMode(uriOrNode)
}

function sizeLimitPrompt(node: S3FileNode, window = Window.vscode()): boolean {
    if (node.file.sizeBytes! > SIZE_LIMIT) {
        window.showErrorMessage(
            localize(
                'AWS.s3.fileViewer.error.invalidSize',
                'Files over 50MB currently not supported for file display, please use the "Download as..." function'
            )
        )
        return false
    }
    return true
}
