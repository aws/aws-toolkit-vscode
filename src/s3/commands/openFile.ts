/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
//TODOD:: change feature icon on package.json

//import * as vscode from 'vscode'import
import { ext } from '../../shared/extensionGlobals'
import { Window } from '../../shared/vscode/window'
//import { localize } from '../../shared/utilities/vsCodeUtils'
//import { showErrorWithLogs } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
//import { FileViewerManager, SingletonManager } from '../util/fileViewerManager'

export async function openFileCommand(node: S3FileNode, window = Window.vscode()): Promise<void> {
    const manager = ext.s3fileViewerManager
    manager.openTab(node)
}
