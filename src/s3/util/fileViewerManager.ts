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
import { downloadWithProgress } from '../commands/downloadFileAs'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
const fs = require('fs')

//const SIZE_LIMIT = 4*Math.pow(10,4)

export class FileViewerManager {
    private cache: Set<S3FileNode>
    //private activeTabs: Set<S3Tab>
    private window: Window
    private outputChannel: OutputChannel
    private tempLocation!: string //TODOD: create temp

    public constructor(window: Window = Window.vscode(), outputChannel = ext.outputChannel) {
        this.cache = new Set<S3FileNode>()
        //this.activeTabs = new Set<S3Tab>()
        this.window = window
        this.outputChannel = outputChannel
        this.createTemp()
        showOutputMessage('initializing manager', outputChannel)
    }

    public async openTab(fileNode: S3FileNode): Promise<void> {
        showOutputMessage(`     manager initialized, file: ${fileNode.file.key}`, this.outputChannel)
        await this.getFile(fileNode)
    }

    public async getFile(fileNode: S3FileNode): Promise<void> {
        if (this.cache.has(fileNode)) {
            //get it from temp, then return that
        }

        //needs to be downloaded from S3

        //if file is +4MB, prompt user to confirm before proceeding
        //TODOD:: how can I know the size of the file before downloading?
        /*
        const uri = vscode.Uri.file('')
        if(fs.statSync(uri).size>SIZE_LIMIT){
            //TODOD:: prompt_user
            showOutputMessage(`size is >4MB, prompt user working`, this.outputChannel)
        }
        */

        //good to continue with download
        const targetLocation = vscode.Uri.file(path.join(this.tempLocation, fileNode.file.key))
        try {
            await downloadWithProgress(fileNode, targetLocation, this.window)
        } catch (err) {
            showOutputMessage(`error calling downloadWithProgress: ${err.toString()}`, this.outputChannel)
        }

        this.cache.add(fileNode)

        //await this.listTempFolder()

        //TODOD:: delegate this logic to S3Tab.ts
        //this will display the document at the end
        //vscode.window.showTextDocument(uri)
    }

    public async listTempFolder(): Promise<void> {
        try {
            const dir = await fs.opendir(this.tempLocation)
            for await (const dirent of dir) console.log(dirent.name)
        } catch (err) {
            console.error(err)
        }
    }

    public async createTemp(): Promise<void> {
        this.tempLocation = await makeTemporaryToolkitFolder()
        showOutputMessage(`folder created with location: ${this.tempLocation}`, this.outputChannel)
    }
}

export class SingletonManager {
    static fileManager: FileViewerManager | undefined

    private constructor() {}

    public static async getInstance(): Promise<FileViewerManager> {
        if (!SingletonManager.fileManager) {
            SingletonManager.fileManager = new FileViewerManager()
        }
        return SingletonManager.fileManager
    }
}
