/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FileViewerManager } from '../util/fileViewerManager'
import { downloadFileAsCommand } from './downloadFileAs'

const SIZE_LIMIT = 50 * Math.pow(10, 6)

export async function openFileCommand(node: S3FileNode, manager: S3FileViewerManager): Promise<void> {
    if (await isFileSizeValid(node.file.sizeBytes)) {
        await manager.openTab(node)
    }
}

export async function openFileEditModeCommand(
    uriOrNode: vscode.Uri | S3FileNode,
    manager: S3FileViewerManager
): Promise<void> {
    let size: number
    let fileNode: S3FileNode | undefined
    if (uriOrNode instanceof S3FileNode) {
        size = uriOrNode.file.sizeBytes!
        fileNode = uriOrNode
    } else {
        size = 0
        fileNode = undefined
    }
    //const size = uriOrNode instanceof S3FileNode ? uriOrNode.file.sizeBytes : fs.statSync(uriOrNode.fsPath).size
    //const fileNode = uriOrNode instanceof S3FileNode ? uriOrNode : undefined
    if (await isFileSizeValid(size, fileNode)) {
        await manager.openInEditMode(uriOrNode)
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
        const response = await window.showErrorMessage(
            localize(
                'AWS.s3.fileViewer.error.invalidSize',
                'Files over 50MB currently not supported for file display, please use the "Download as..." function'
            ),
            'Download as..'
        )
        if (response === 'Download as..') {
            await downloadFileAsCommand(fileNode!)
        }
        return false
    }

    return true
}
