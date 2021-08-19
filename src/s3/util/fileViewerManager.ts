/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as fs from 'fs'
import { mkdirp } from 'fs-extra'
import { OutputChannel } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { showOutputMessage } from '../../shared/utilities/messages'
import { Commands } from '../../shared/vscode/commands'
import { downloadWithProgress } from '../commands/downloadFileAs'
import { S3FileNode } from '../explorer/s3FileNode'
import { readablePath } from '../util'
import { S3Tab } from './s3Tab'
import { getLogger } from '../../shared/logger'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { localize } from '../../shared/utilities/vsCodeUtils'

const SIZE_LIMIT = 4 * Math.pow(10, 6)

export class S3FileViewerManager {
    private cacheArns: Set<string>
    private activeTabs: Map<string, S3Tab>
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
        this.activeTabs = new Map<string, S3Tab>()
        this.window = window
        this.commands = commands
        this.tempLocation = tempLocation
        this.outputChannel = ext.outputChannel
    }

    /**
     * Given an S3FileNode, this function:
     * Checks and creates a cache to store downloads
     * Retrieves previously cached files on cache and
     * Downloads file from S3 ands stores in cache
     * Opens the tab on read-only with the use of an S3Tab
     *
     * @param fileNode
     * @returns
     */
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

        const newTab = this.activeTabs.get(fileLocation.fsPath) ?? new S3Tab(fileLocation)
        await newTab.openFileInReadOnly()

        this.activeTabs.set(fileLocation.fsPath, newTab)
    }

    public async openInEditMode(uriOrNode: vscode.Uri | S3FileNode): Promise<void> {
        if (uriOrNode instanceof vscode.Uri) {
            //was activated from an open tab
            if (this.activeTabs.has(uriOrNode.fsPath)) {
                const tab = this.activeTabs.get(uriOrNode.fsPath)
                await tab!.openFileInEditMode()
            } else {
                this.window.showErrorMessage(
                    localize(
                        'AWS.s3.fileViewer.error.editMode',
                        'Error switching to edit mode, please try reopening from the AWS Explorer'
                    )
                )
            }
        } else {
            //was activated from the explorer, need to get the file
            const fileLocation = await this.getFile(uriOrNode)
            if (!fileLocation) {
                return
            }
            const newTab = this.activeTabs.get(fileLocation.fsPath) ?? new S3Tab(fileLocation)
            await newTab.openFileInEditMode()
        }
    }

    /**
     * Fetches a file from S3 or gets it from the local cache if possible and still valid.
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
            getLogger().debug(`FileViewer: File size couldn't be determined, prompting user file: ${fileNode}`)

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
                getLogger().debug(`FileViewer: User cancelled download`)
                showOutputMessage(
                    localize('AWS.s3.fileViewer.message.noSizeCancellation', 'Download cancelled'),
                    this.outputChannel
                )
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
                getLogger().debug(`FileViewer: User cancelled download`)
                showOutputMessage(
                    localize('AWS.s3.fileViewer.message.sizeLimitCancellation', 'Download cancelled'),
                    this.outputChannel
                )
                return undefined
            }

            getLogger().debug(`FileViewer: User confirmed download, continuing`)
        }

        if (!(await this.createSubFolders(targetPath))) {
            //error creating the folder structure
            return undefined
        }

        try {
            await downloadWithProgress(fileNode, targetLocation, this.window)
        } catch (err) {
            getLogger().error(`FileViewer: error calling downloadWithProgress: ${err.toString()}`)
            showOutputMessage(
                localize(
                    'AWS.s3.fileViewer.error.download',
                    'Error downloading file {0} from S3: {1}',
                    fileNode.file.name,
                    err.toString()
                ),
                this.outputChannel
            )
            return undefined
        }

        this.cacheArns.add(fileNode.file.arn)
        getLogger().debug(`New cached file: ${fileNode.file.arn} \n Cache contains: ${this.cacheArns.toString()}`)
        return targetLocation
    }

    /**
     * Searches for given node previously downloaded to cache.
     * Ensures that the cached download is still valid (hasn't been modified in S3 since its caching)
     *
     * @param fileNode - Node to be searched in temp
     * @returns Location in temp directory, if any
     */
    public async getFromTemp(fileNode: S3FileNode): Promise<vscode.Uri | undefined> {
        const targetPath = await this.createTargetPath(fileNode)
        const targetLocation = vscode.Uri.file(targetPath)

        if (this.cacheArns.has(fileNode.file.arn)) {
            getLogger().info(
                `FileViewer: found file ${fileNode.file.key} in cache\n Cache contains: ${this.cacheArns.toString()}`
            )

            //Explorer (or at least the S3Node) needs to be refreshed to get the last modified date from S3
            const newNode = await this.refreshNode(fileNode)
            if (!newNode) {
                getLogger().error(`FileViewer: Error, refreshNode() returned undefined with file: ${fileNode.file.key}`)
                getLogger().debug(`Cache contains: ${this.cacheArns.toString()}`)
                return
            }

            fileNode = newNode
            const lastModifiedInS3 = fileNode!.file.lastModified
            const { birthtime } = fs.statSync(targetLocation.fsPath)

            getLogger().debug(
                `FileViewer: File ${fileNode.file.name} was last modified in S3: ${lastModifiedInS3}, cached on: ${birthtime}`
            )

            if (lastModifiedInS3! <= birthtime) {
                getLogger().info(`FileViewer: good to retrieve, last modified date is before creation`)
                return targetLocation
            } else {
                fs.unlinkSync(targetPath)
                getLogger().info(
                    `FileViewer: Last modified in s3 date is after cached date, removing file and redownloading`
                )
                return undefined
            }
        }
        return undefined
    }

    /**
     * E.g. For a file 'foo.txt' inside a bucket 'bucketName' and folder 'folderName'
     * '/tmp/aws-toolkit-vscode/vsctkzV38Hc/bucketName/folderName/[S3]foo.txt'
     *
     * @param fileNode
     * @returns fs path that has the tempLocation, the S3 location (bucket and folders) and the name with the file preceded by [S3]
     */
    public createTargetPath(fileNode: S3FileNode): Promise<string> {
        let completePath = readablePath(fileNode)
        completePath = `${this.tempLocation!}${completePath.slice(4, completePath.lastIndexOf('/') + 1)}[S3]${
            fileNode.file.name
        }`

        return Promise.resolve(completePath)
    }

    private async createSubFolders(targetPath: string): Promise<boolean> {
        const folderStructure = targetPath.slice(undefined, targetPath.lastIndexOf('/'))

        try {
            await mkdirp(folderStructure)
        } catch (e) {
            getLogger().error(`S3FileViewer: Error creating S3 folder structure on system error: ${e}`)
            return false
        }
        return true
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
    private listTempFolder(): Promise<void> {
        getLogger().debug('-------contents in temp:')
        showOutputMessage('-------contents in temp:', this.outputChannel)

        fs.readdirSync(this.tempLocation!).forEach((file: any) => {
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
        getLogger().info(`Temp folder for FileViewer created with location: ${this.tempLocation}`)
    }
}
