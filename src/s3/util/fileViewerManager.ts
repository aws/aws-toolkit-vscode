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
import { readablePath } from '../util'

const fs = require('fs')
const SIZE_LIMIT = 4 * Math.pow(10, 4)

export class S3FileViewerManager {
    private cacheArn: Set<string>
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
        this.cacheArn = new Set<string>()
        //this.activeTabs = new Set<S3Tab>()
        this.window = window
        this.outputChannel = outputChannel
        this.commands = commands

        showOutputMessage('initializing manager', outputChannel)
    }

    public async openTab(fileNode: S3FileNode): Promise<void> {
        showOutputMessage(
            `++++++++++++++++++++++++++++++++manager was initialized, file: ${fileNode.file.key}`,
            this.outputChannel
        )
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
        const targetPath = await this.createTargetPath(fileNode)
        const targetLocation = vscode.Uri.file(targetPath)

        if (this.cacheArn.has(fileNode.file.arn)) {
            //get it from temp IF it hasn't been recently modified, then return that
            showOutputMessage(`cache is working!, found ${fileNode.file.key} in cache`, this.outputChannel) //TODOD:: debug log remove
            //explorer (or at least the S3Node) needs to be refreshed to get the last modified date from S3
            const newNode = await this.refreshNode(fileNode)
            if (!newNode) {
                showOutputMessage(
                    `!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! something happeneded`,
                    this.outputChannel
                ) //TODOD:: debug log, remove
                return
            }

            fileNode = newNode
            const lastModifiedInS3 = fileNode!.file.lastModified
            const { birthtime } = fs.statSync(targetLocation.fsPath)
            showOutputMessage(`last modified in S3: ${lastModifiedInS3}`, this.outputChannel) //TODOD: debug log, remove
            showOutputMessage(`creation date: ${birthtime}`, this.outputChannel) //TODOD: debug log, remove
            if (lastModifiedInS3! <= birthtime) {
                showOutputMessage(`good to retreive, last modified date is before creation`, this.outputChannel) //TODOD: debug log, remove
                await this.listTempFolder()
                return targetLocation
            } else {
                showOutputMessage(
                    `last modified date is after creation date!!, removing file and redownloading`,
                    this.outputChannel
                ) //TODOD: debug log, remove
                fs.unlinkSync(targetPath)
                this.listTempFolder()
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

        this.cacheArn.add(fileNode.file.arn)
        await this.listTempFolder()

        return targetLocation
    }

    async createTargetPath(fileNode: S3FileNode): Promise<string> {
        let completePath = readablePath(fileNode)
        completePath = completePath.slice(4) //removes 's3://' from path

        const splittedPath = completePath.split('/')
        completePath = splittedPath.join(':')

        return path.join(this.tempLocation, 'S3:' + completePath)
    }

    async refreshNode(fileNode: S3FileNode): Promise<S3FileNode | undefined> {
        const parent = fileNode.parent
        parent.clearChildren()

        await this.commands.execute('aws.refreshAwsExplorerNode', fileNode)
        await this.commands.execute('aws.refreshAwsExplorerNode', parent)
        await this.commands.execute('aws.loadMoreChildren', parent)

        const children = await parent.getChildren()

        children.forEach(child => {
            if (child instanceof S3FileNode && child.file.arn == fileNode.file.arn) return child
        })

        return fileNode
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
