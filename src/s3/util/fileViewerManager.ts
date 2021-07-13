/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs'
import { OutputChannel } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { showOutputMessage } from '../../shared/utilities/messages'
import { Commands } from '../../shared/vscode/commands'
import { downloadWithProgress } from '../commands/downloadFileAs'
import { S3FileNode } from '../explorer/s3FileNode'
import { readablePath } from '../util'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { getLogger } from '../../shared/logger'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { localize } from '../../shared/utilities/vsCodeUtils'

const SIZE_LIMIT = 4 * Math.pow(10, 6)

export class S3FileViewerManager {
    private cacheArns: Set<string>
    //private activeTabs: Set<S3Tab>
    private window: typeof vscode.window
    private outputChannel: OutputChannel
    private commands: Commands
    private tempLocation: string | undefined

    public constructor(
        cacheArn: Set<string> = new Set<string>(),
        window: typeof vscode.window = vscode.window,
        commands = Commands.vscode(),
        tempLocation?: string
    ) {
        this.cacheArns = cacheArn
        //this.activeTabs = new Set<S3Tab>()
        this.window = window
        this.commands = commands
        this.tempLocation = tempLocation
        this.outputChannel = ext.outputChannel
    }

    public async openTab(fileNode: S3FileNode): Promise<void> {
        getLogger().debug(`++++++++++++++++++++++++++++++++manager was initialized, file: ${fileNode.file.key}`)
        showOutputMessage(
            `++++++++++++++++++++++++++++++++manager was initialized, file: ${fileNode.file.key}`,
            this.outputChannel
        )

        const fileLocation = await this.getFile(fileNode)
        if (!fileLocation) {
            return
        }
        getLogger().debug(`file to be opened is: ${fileLocation}`)
        showOutputMessage(`file to be opened is: ${fileLocation}`, this.outputChannel)
        //TODOD:: delegate this logic to S3Tab.ts
        //this will display the document at the end
        this.window.showTextDocument(fileLocation)
    }

    /**
     * Fetches a file from S3 or gets it from the local cache if possible.
     */
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
            const message = localize(
                'AWS.s3.fileViewer.warning.noSize',
                "File size couldn't be determined. Continue with download?"
            )
            const args = {
                prompt: message,
                confirm: localize('AWS.generic.continueDownload', 'Continue with download'),
                cancel: localize('AWS.generic.cancel', 'Cancel'),
            }

            if (!(await showConfirmationMessage(args, this.window))) {
                return undefined
            }
        } else if (fileNode.file.sizeBytes > SIZE_LIMIT) {
            showOutputMessage(`size is >4MB, prompt user working`, this.outputChannel)
            getLogger().debug(`size is >4MB, prompt user working`)

            const message = localize(
                'AWS.s3.fileViewer.warning.4mb',
                'File size is more than 4MB. Continue with download?'
            )
            const args = {
                prompt: message,
                confirm: localize('AWS.generic.continueDownload', 'Continue with download'),
                cancel: localize('AWS.generic.cancel', 'Cancel'),
            }

            if (!(await showConfirmationMessage(args, this.window))) {
                return undefined
            }

            getLogger().debug(`user confirmed download, continuing`)
            showOutputMessage(`user confirmed download, continuing`, this.outputChannel) //TODOD:: debug log,
        }

        //good to continue with download
        try {
            await downloadWithProgress(fileNode, targetLocation, this.window)
        } catch (err) {
            getLogger().debug(`error calling downloadWithProgress: ${err.toString()}`)
            showOutputMessage(`error calling downloadWithProgress: ${err.toString()}`, this.outputChannel)
        }

        this.cacheArns.add(fileNode.file.arn)
        //await this.listTempFolder()

        return targetLocation
    }

    public async getFromTemp(fileNode: S3FileNode): Promise<vscode.Uri | undefined> {
        const targetPath = await this.createTargetPath(fileNode)
        const targetLocation = vscode.Uri.file(targetPath)

        if (this.cacheArns.has(fileNode.file.arn)) {
            //get it from temp IF it hasn't been recently modified, then return that

            getLogger().debug(`cache is working!, found ${fileNode.file.key} in cache`)
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

            getLogger().debug(`last modified in S3: ${lastModifiedInS3}`)
            showOutputMessage(`last modified in S3: ${lastModifiedInS3}`, this.outputChannel) //TODOD: debug log, remove
            showOutputMessage(`creation date: ${birthtime}`, this.outputChannel)
            getLogger().debug(`creation date: ${birthtime}`) //TODOD: debug log, remove

            if (lastModifiedInS3! <= birthtime) {
                showOutputMessage(`good to retreive, last modified date is before creation`, this.outputChannel) //TODOD: debug log, remove
                getLogger().debug(`good to retreive, last modified date is before creation`)

                //await this.listTempFolder()
                return targetLocation
            } else {
                getLogger().debug(`last modified date is after creation date!!, removing file and redownloading`)
                showOutputMessage(
                    `last modified date is after creation date!!, removing file and redownloading`,
                    this.outputChannel
                ) //TODOD: debug log, remove

                fs.unlinkSync(targetPath)
                return undefined
            }
        }
        return undefined
    }

    public createTargetPath(fileNode: S3FileNode): Promise<string> {
        const completePath = getStringHash(readablePath(fileNode)) //TODOD:: map hashes to real name
        //completePath = completePath.slice(4) //removes 's3://' from path

        //const splittedPath = completePath.split('/')
        //completePath = splittedPath.join('%')

        return Promise.resolve(path.join(this.tempLocation!, 'S3%' + completePath))
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

    /*
    //TODOD:: remove helper method
    private listTempFolder(): Promise<void> {
        getLogger().debug('-------contents in temp:')
        showOutputMessage('-------contents in temp:', this.outputChannel)

        fs.readdirSync(this.tempLocation).forEach((file: any) => {
            showOutputMessage(` ${file}`, this.outputChannel)
            getLogger().debug(` ${file}`)
        })

        getLogger().debug('-------------------------')
        showOutputMessage('-------------------------', this.outputChannel)
        return Promise.resolve()
    }*/

    private async createTemp(): Promise<void> {
        this.tempLocation = await makeTemporaryToolkitFolder()
        showOutputMessage(`folder created with location: ${this.tempLocation}`, this.outputChannel)
        getLogger().debug(`folder created with location: ${this.tempLocation}`)
    }
}
