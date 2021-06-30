/* eslint-disable header/header */
import { ext } from '../../shared/extensionGlobals'
import { S3FileNode } from '../explorer/s3FileNode'
import { Window } from '../../shared/vscode/window'
import { showOutputMessage } from '../../shared/utilities/messages'

export class FileViewerManager {
    //private cache: Set<S3FileNode>
    //private activeTabs: Set<S3Tab>
    //private window: Window

    public constructor(window: Window = Window.vscode(), outputChannel = ext.outputChannel) {
        //this.cache = new Set<S3FileNode>()
        //this.activeTabs = new Set<S3Tab>()
        //this.window = window
        showOutputMessage('initializing manager', outputChannel)
    }

    public async openTab(fileNode: S3FileNode, outputChannel = ext.outputChannel): Promise<void> {
        showOutputMessage(`     manager initialized, file: ${fileNode.file.key}`, outputChannel)
    }
}

export class SingletonManager {
    static fileManager: FileViewerManager | undefined

    private constructor() {}

    public static getInstance(): FileViewerManager {
        if (!SingletonManager.fileManager) {
            SingletonManager.fileManager = new FileViewerManager()
        }
        return SingletonManager.fileManager
    }
}
