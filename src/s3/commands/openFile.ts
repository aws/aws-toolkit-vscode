/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
//TODOD:: change feature icon on package.json

import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { Window } from '../../shared/vscode/window'
//import { localize } from '../../shared/utilities/vsCodeUtils'
//import { showErrorWithLogs } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
//import { FileViewerManager, SingletonManager } from '../util/fileViewerManager'

export async function openFileCommand(node: S3FileNode, window = Window.vscode()): Promise<void> {
    const manager = ext.s3fileViewerManager
    await manager.openTab(node)
}

export async function openFileEditModeCommand(s3Uri?: vscode.Uri): Promise<void> {
    //TODOD:: implement this later, after approval of read-only
    /*
    const manager = ext.s3fileViewerManager
    manager.openCurrentOnEdit(s3Uri)*/
}
