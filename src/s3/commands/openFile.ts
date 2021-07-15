/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
//import { localize } from '../../shared/utilities/vsCodeUtils'
//import { showErrorWithLogs } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
//import { FileViewerManager, SingletonManager } from '../util/fileViewerManager'

const SIZE_LIMIT = 50 * Math.pow(10, 6)
export async function openFileCommand(node: S3FileNode, window = Window.vscode()): Promise<void> {
    if (node.file.sizeBytes! > SIZE_LIMIT) {
        window.showErrorMessage(
            localize(
                'AWS.s3.fileViewer.error.invalidSize',
                'Files over 50MB currently not supported for file display, please use the "download as" function'
            )
        )
        return
    }
    const manager = ext.s3fileViewerManager
    await manager.openTab(node)
}

export async function openFileEditModeCommand(s3Uri?: vscode.Uri): Promise<void> {
    //TODOD:: implement this later, after approval of read-only
    /*
    const manager = ext.s3fileViewerManager
    manager.openCurrentOnEdit(s3Uri)*/
}
