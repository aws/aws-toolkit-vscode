/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
//TODOD:: change feature icon on package.json

//import * as vscode from 'vscode'import
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
    manager.openTab(node)
}
