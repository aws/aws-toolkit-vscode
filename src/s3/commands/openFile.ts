/* eslint-disable header/header */
//TODOD:: what is the header?
//TODOD:: change feature icon on package.json

//import * as vscode from 'vscode'
import { Window } from '../../shared/vscode/window'
//import { localize } from '../../shared/utilities/vsCodeUtils'
import { showErrorWithLogs, showOutputMessage } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
import { FileViewerManager, SingletonManager } from '../util/FileViewerManager'

let manager: FileViewerManager

export async function openFileCommand(node: S3FileNode, window = Window.vscode()): Promise<void> {
    showErrorWithLogs('working', window)
    manager = SingletonManager.getInstance()
    manager.openTab(node)
}
