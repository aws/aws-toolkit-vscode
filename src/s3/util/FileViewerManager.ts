/* eslint-disable header/header */
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3Tab } from './S3Tab'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { showErrorWithLogs, showOutputMessage } from '../../shared/utilities/messages'

export class FileViewerManager {
    private cache: Set<S3FileNode>
    private activeTabs: Set<S3Tab>
    private window: Window

    public constructor(window: Window = Window.vscode()) {
        this.cache = new Set<S3FileNode>()
        this.activeTabs = new Set<S3Tab>()
        this.window = window
        showErrorWithLogs('initializing manager', window)
    }

    public async openTab(fileNode: S3FileNode, outputChannel = ext.outputChannel): Promise<void> {
        showOutputMessage(`manager initialized, file: ${fileNode}`, outputChannel)
    }
}
