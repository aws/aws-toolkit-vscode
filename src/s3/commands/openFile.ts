/* eslint-disable header/header */
//TODOD:: what is the header?

//import * as vscode from 'vscode'
import { Window } from '../../shared/vscode/window'
//import { localize } from '../../shared/utilities/vsCodeUtils'
import { showErrorWithLogs, showOutputMessage } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
import { FileViewerManager } from '../util/FileViewerManager'

let manager: FileViewerManager | undefined

export async function openFileCommand(node: S3FileNode, window = Window.vscode()): Promise<void> {
    showErrorWithLogs('working', window)

    if (!manager) {
        manager = new FileViewerManager(window)
    }

    manager.openTab(node)
}
