/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import * as vscode from 'vscode'
import { OutputChannel } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { showOutputMessage } from '../../shared/utilities/messages'
import { Commands } from '../../shared/vscode/commands'
import { downloadWithProgress } from '../commands/downloadFileAs'
import { S3FileNode } from '../explorer/s3FileNode'
import { readablePath } from '../util'
import { getStringHash } from '../../shared/utilities/textUtilities'

const fs = require('fs')
const SIZE_LIMIT = 4 * Math.pow(10, 6)

export class S3FileViewerManager {
    private cacheArns: Set<string>
    //private activeTabs: Set<S3Tab>
    private window: typeof vscode.window
    private outputChannel: OutputChannel
    private commands: Commands
    private tempLocation: string | undefined //TODOD: create temp

    public constructor(
        cacheArn: Set<string> = new Set<string>(),
        window: typeof vscode.window = vscode.window,
        commands = Commands.vscode(),
        tempLocation?: string
    ) {
        this.cacheArn = cacheArn
        //this.activeTabs = new Set<S3Tab>()
        this.window = window
        this.commands = commands
        this.tempLocation = tempLocation
        this.outputChannel = ext.outputChannel
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
        this.window.showTextDocument(fileLocation)
    }

    public async getFile(fileNode: S3FileNode): Promise<vscode.Uri | undefined> {
        if (!this.tempLocation) {
            await this.createTemp()
        }
        const targetPath = await this.createTargetPath(fileNode)
        const targetLocation = vscode.Uri.file(targetPath)

        const tempFile: vscode.Uri | undefined = await this.getFromTemp(fileNode)
        //if it was found in temp, return the Uri location
        if (tempFile) {
            return tempFile
        }

        //needs to be downloaded from S3
        //if file is +4MB, prompt user to confirm before proceeding
        //const uri = vscode.Uri.file('')

        if (fileNode.file.sizeBytes === undefined) {
            const message = "The size of this file couldn't be determined, do you want to continue with the download?"
            if (!(await this.promptUserConfirm(message))) return undefined
        } else if (fileNode.file.sizeBytes > SIZE_LIMIT) {
            showOutputMessage(`size is >4MB, prompt user working`, this.outputChannel)

            const message = 'File size is greater than 4MB, do you want to continue with download?'
            if (!(await this.promptUserConfirm(message))) return undefined

            showOutputMessage(`user confirmed download, continuing`, this.outputChannel) //TODOD:: debug log,
        }

        //good to continue with download
        try {
            await downloadWithProgress(fileNode, targetLocation, this.window)
        } catch (err) {
            showOutputMessage(`error calling downloadWithProgress: ${err.toString()}`, this.outputChannel)
        }

        this.cacheArn.add(fileNode.file.arn)
        //await this.listTempFolder()

        return targetLocation
    }

    async getFromTemp(fileNode: S3FileNode): Promise<vscode.Uri | undefined> {
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
                //await this.listTempFolder()
                return targetLocation
            } else {
                showOutputMessage(
                    `last modified date is after creation date!!, removing file and redownloading`,
                    this.outputChannel
                ) //TODOD: debug log, remove
                fs.unlinkSync(targetPath)
                //this.listTempFolder()
                return undefined
            }
        }
        return undefined
    }

    async promptUserConfirm(message: string): Promise<string | undefined> {
        //for some reason sizeBytes is undefined
        const cancelButtonLabel = 'Cancel' //TODOD:: localize
        const confirmButtonLabel = 'Continue with download' //TODOD:: localize

        const result = await this.window.showInformationMessage(
            message, //TODOD:: localize?
            cancelButtonLabel,
            confirmButtonLabel
        )
        if (result === cancelButtonLabel) {
            return undefined
        }
        return undefined
    }

    async createTargetPath(fileNode: S3FileNode): Promise<string> {
        const completePath = getStringHash(readablePath(fileNode)) //TODOD:: map hashes to real name
        //completePath = completePath.slice(4) //removes 's3://' from path

        //const splittedPath = completePath.split('/')
        //completePath = splittedPath.join('%')

        return path.join(this.tempLocation!, 'S3%' + completePath)
    }

    async refreshNode(fileNode: S3FileNode): Promise<S3FileNode | undefined> {
        const parent = fileNode.parent
        parent.clearChildren()

        await this.commands.execute('aws.refreshAwsExplorerNode', fileNode)
        await this.commands.execute('aws.refreshAwsExplorerNode', parent)
        await this.commands.execute('aws.loadMoreChildren', parent)

        const children = await parent.getChildren()

        children.forEach(child => {
            if ((child as any).name === fileNode.name) fileNode = child as S3FileNode
        })

        return fileNode
    }

    //TODOD:: remove helper method
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
