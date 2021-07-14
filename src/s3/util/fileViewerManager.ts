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
        getLogger().verbose(`S3FileViewer: Retrieving and displaying file: ${fileNode.file.key}`)
        showOutputMessage(
            localize('AWS.s3.fileViewer.info.fileKey', 'Retrieving and displaying file: {0}', fileNode.file.key),
            this.outputChannel
        )

        const fileLocation = await this.getFile(fileNode)
        if (!fileLocation) {
            return
        }
        getLogger().verbose(`S3FileViewer: File from s3 or temp to be opened is: ${fileLocation}`)
        showOutputMessage(
            localize('AWS.s3.fileViewer.info.fileLocation', 'File to be opened is: {0}', fileLocation.toString()),
            this.outputChannel
        )

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
        //If it was found in temp, return the Uri location
        if (tempFile) {
            return tempFile
        }

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
            getLogger().debug(`FileViewer: File size ${fileNode.file.sizeBytes} is >4MB, prompting user`)

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

            getLogger().debug(`FileViewer: User confirmed download, continuing`)
            showOutputMessage(
                localize('AWS.s3.fileViewer.message.sizeLimitConfirmed', 'Confirmed download, continuing'),
                this.outputChannel
            )
        }

        try {
            await downloadWithProgress(fileNode, targetLocation, this.window)
        } catch (err) {
            getLogger().error(`FileViewer: error calling downloadWithProgress: ${err.toString()}`)
            showOutputMessage(
                localize('AWS.s3.fileViewer.error.download', 'Error downloading: {0}', err.toString()),
                this.outputChannel
            )
        }

        this.cacheArns.add(fileNode.file.arn)

        return targetLocation
    }

    public async getFromTemp(fileNode: S3FileNode): Promise<vscode.Uri | undefined> {
        const targetPath = await this.createTargetPath(fileNode)
        const targetLocation = vscode.Uri.file(targetPath)

        if (this.cacheArns.has(fileNode.file.arn)) {
            getLogger().info(`FileViewer: found file ${fileNode.file.key} in cache`)

            //Explorer (or at least the S3Node) needs to be refreshed to get the last modified date from S3
            const newNode = await this.refreshNode(fileNode)
            if (!newNode) {
                getLogger().error(`FileViewer: Error, refreshNode() returned undefined with file: ${fileNode.file.key}`)
                getLogger().debug(`Cache contains: ${this.cacheArns}`)
                return
            }

            fileNode = newNode
            const lastModifiedInS3 = fileNode!.file.lastModified
            const { birthtime } = fs.statSync(targetLocation.fsPath)

            getLogger().debug(`FileViewer: File ${fileNode.file.name} was last modified in S3: ${lastModifiedInS3}`)
            getLogger().debug(`FileViewer: Last cached download date: ${birthtime}`)

            if (lastModifiedInS3! <= birthtime) {
                getLogger().info(`FileViewer: good to retrieve, last modified date is before creation`)
                return targetLocation
            } else {
                fs.unlinkSync(targetPath)
                getLogger().warn(
                    `FileViewer: Last modified in s3 date is after cached date, removing file and redownloading`
                )
                return undefined
            }
        }
        return undefined
    }

    public createTargetPath(fileNode: S3FileNode): Promise<string> {
        const completePath = getStringHash(readablePath(fileNode))
        return Promise.resolve(path.join(this.tempLocation!, 'S3%' + completePath))
    }

    async refreshNode(fileNode: S3FileNode): Promise<S3FileNode | undefined> {
        const parent = fileNode.parent
        parent.clearChildren()

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
        showOutputMessage(
            localize(
                'AWS.s3.message.tempCreation',
                'Temp folder for FileViewer created with location: {0}',
                this.tempLocation
            ),
            this.outputChannel
        )
        getLogger().debug(`Temp folder for FileViewer created with location: ${this.tempLocation}`)
    }
}
