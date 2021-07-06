/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { S3FileNode } from '../explorer/s3FileNode'
import { Window } from '../../shared/vscode/window'
import { showOutputMessage } from '../../shared/utilities/messages'
import { OutputChannel } from 'vscode'
import { Commands } from '../../shared/vscode/commands'
import { downloadWithProgress } from '../commands/downloadFileAs'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { runInThisContext } from 'vm'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { S3BucketNode } from '../explorer/s3BucketNode'

const fs = require('fs')

const SIZE_LIMIT = 4 * Math.pow(10, 4)

export class S3FileViewerManager {
    private cache: Set<S3FileNode>
    //private activeTabs: Set<S3Tab>
    private window: Window
    private outputChannel: OutputChannel
    private commands: Commands
    private tempLocation!: string //TODOD: create temp

    public constructor(
        window: Window = Window.vscode(),
        outputChannel = ext.outputChannel,
        commands = Commands.vscode()
    ) {
        this.cache = new Set<S3FileNode>()
        //this.activeTabs = new Set<S3Tab>()
        this.window = window
        this.outputChannel = outputChannel
        this.commands = commands

        showOutputMessage('initializing manager', outputChannel)
    }

    public async openTab(fileNode: S3FileNode): Promise<void> {
        showOutputMessage(`     manager initialized, file: ${fileNode.file.key}`, this.outputChannel)
        const fileLocation = await this.getFile(fileNode)
        if (!fileLocation) {
            return
        }
        showOutputMessage(`file to be opened is: ${fileLocation}`, this.outputChannel)
        //TODOD:: delegate this logic to S3Tab.ts
        //this will display the document at the end
        vscode.window.showTextDocument(fileLocation)
    }

    public async getFile(fileNode: S3FileNode): Promise<vscode.Uri | undefined> {
        const targetPath = path.join(this.tempLocation, fileNode.file.key)
        const targetLocation = vscode.Uri.file(targetPath)
        if (this.cache.has(fileNode)) {
            //get it from temp IF it hasn't been recently modified, then return that
            showOutputMessage(`cache is working!, found ${fileNode.file.key} in cache`, this.outputChannel)
            //explorer (or at least the S3Node) needs to be refreshed to get the last modified date from S3
            const lastModifiedInS3 = this.lastModified(fileNode)

            const { birthtime } = fs.statSync(targetLocation.fsPath)
            showOutputMessage(`${lastModifiedInS3}`, this.outputChannel)
            showOutputMessage(`${birthtime}`, this.outputChannel)
            if (lastModifiedInS3! <= birthtime) {
                showOutputMessage(`good to retreive, last modified date is before creation`, this.outputChannel)
                return targetLocation
            } else {
                showOutputMessage(`last modified date is after creation date!!`, this.outputChannel)
            }
        }

        //needs to be downloaded from S3
        //if file is +4MB, prompt user to confirm before proceeding

        //fs.statSync(uri).size
        //const uri = vscode.Uri.file('')
        //TODOD: when can sizeBytes be undefined?
        if (fileNode.file.sizeBytes! > SIZE_LIMIT) {
            showOutputMessage(`size is >4MB, prompt user working`, this.outputChannel)
            const cancelButtonLabel = 'Cancel' //TODOD:: localize
            const confirmButtonLabel = 'Continue with download'
            //TODOD:: prompt_user
            const result = await vscode.window.showInformationMessage(
                'File size is greater than 4MB are you sure you want to continue with download?',
                cancelButtonLabel,
                confirmButtonLabel
            )
            if (result === cancelButtonLabel) {
                return undefined
            }
            showOutputMessage(`user confirmed download, continuing`, this.outputChannel)
        }

        //good to continue with download
        try {
            await downloadWithProgress(fileNode, targetLocation, this.window)
        } catch (err) {
            showOutputMessage(`error calling downloadWithProgress: ${err.toString()}`, this.outputChannel)
        }

        this.cache.add(fileNode)
        await this.listTempFolder()

        return targetLocation
    }

    async lastModified(fileNode: S3FileNode) {
        let parent = fileNode.parent
        while (parent instanceof S3FolderNode) {
            parent = fileNode.parent
        }
        parent as S3BucketNode
        await this.commands.execute('aws.refreshAwsExplorerNode', parent)

        await this.commands.execute('aws.loadMoreChildren', fileNode) //TODOD:: not being refreshed, why???
        const lastModifiedInS3 = fileNode.file.lastModified
        return lastModifiedInS3
    }

    public async listTempFolder(): Promise<void> {
        showOutputMessage('-------contents in temp:', this.outputChannel)

        fs.readdirSync(this.tempLocation).forEach((file: any) => {
            showOutputMessage(` ${file}`, this.outputChannel)
        })

        showOutputMessage('-------------------------', this.outputChannel)
    }

    public async createTemp(): Promise<void> {
        this.tempLocation = await makeTemporaryToolkitFolder()
        showOutputMessage(`folder created with location: ${this.tempLocation}`, this.outputChannel)
    }
}

export class SingletonManager {
    static fileManager: S3FileViewerManager | undefined

    private constructor() {}

    public static async getInstance(): Promise<S3FileViewerManager> {
        if (!SingletonManager.fileManager) {
            SingletonManager.fileManager = new S3FileViewerManager()
            await SingletonManager.fileManager.createTemp()
        }
        return SingletonManager.fileManager
    }
}
