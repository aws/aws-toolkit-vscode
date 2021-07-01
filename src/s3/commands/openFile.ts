/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
//TODOD:: change feature icon on package.json

//import * as vscode from 'vscode'
import { Window } from '../../shared/vscode/window'
//import { localize } from '../../shared/utilities/vsCodeUtils'
//import { showErrorWithLogs } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
import { FileViewerManager, SingletonManager } from '../util/fileViewerManager'

let manager: FileViewerManager

export async function openFileCommand(node: S3FileNode, window = Window.vscode()): Promise<void> {
    manager = SingletonManager.getInstance()
    manager.openTab(node)
}
