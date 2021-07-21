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
    private outputChannel: OutputChannel
    private promptOnEdit = true
    //onDidChange to trigger refresh of contents on the document provider
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }

    public constructor(
        private cacheArns: Set<string> = new Set<string>(),
        private window: typeof vscode.window = vscode.window,
        private commands = Commands.vscode(),
        private _tempLocation?: string,
        private activeTabs: Map<string, S3Tab> = new Map<string, S3Tab>()
    ) {
        this.outputChannel = ext.outputChannel

        vscode.workspace.onDidSaveTextDocument(async savedTextDoc => {
            if (this.activeTabs.has(savedTextDoc.uri.fsPath)) {
                const activeTab = this.activeTabs.get(savedTextDoc.uri.fsPath)
                if (!activeTab) {
                    return
                }

                if (await this.checkForValidity(activeTab.s3FileNode, activeTab.fileUri)) {
                    //good to upload
                    await activeTab.uploadChangesToS3()
                    //refresh the activeTab.s3FileNode?
                    const fileNode = await this.refreshNode(activeTab.s3FileNode)
                    if (!fileNode) {
                        return
                    }
                    await this.removeAndCloseTab(activeTab)
                    await this.openTab(fileNode)
                    this._onDidChange.fire(activeTab.s3Uri)
                } else {
                    //file is not valid to upload, please redownload again, changes may be lost, be aware of that
                }
            }
        })
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

        const newTab = this.activeTabs.get(fileLocation.fsPath) ?? new S3Tab(fileLocation, fileNode)
        await newTab.openFileOnReadOnly()

        this.activeTabs.set(fileLocation.fsPath, newTab)
    }

    public async openOnEditMode(uriOrNode: vscode.Uri | S3FileNode): Promise<void> {
        if (this.promptOnEdit) {
            const message =
                'Switching S3 tab to Editing Mode, please be aware all saved changes will be uploaded back to the original location in S3'

            const dontShow = "Don't show this again"
            const help = 'Help'

            this.window.showWarningMessage(message, dontShow, help).then(selection => {
                if (selection === dontShow) {
                    this.promptOnEdit = false
                }

                if (selection === help) {
                    //add help section
                }
            })
        }
        if (uriOrNode instanceof vscode.Uri) {
            //was activated from an open tab
            if (this.activeTabs.has(uriOrNode.fsPath)) {
                const tab = this.activeTabs.get(uriOrNode.fsPath)
                await tab!.openFileOnEditMode()
            }
        } else if (uriOrNode instanceof S3FileNode) {
            //was activated from the explorer, need to get the file
            const fileLocation = await this.getFile(uriOrNode)
            if (!fileLocation) {
                return
            }
            const newTab = this.activeTabs.get(fileLocation.fsPath) ?? new S3Tab(fileLocation, uriOrNode)
            await newTab.openFileOnEditMode()
        }
    }

    /**
     * Fetches a file from S3 or gets it from the local cache if possible and still valid.
     */
    public async getFile(fileNode: S3FileNode): Promise<vscode.Uri | undefined> {
        if (!this._tempLocation) {
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

        await this.createSubFolders(targetPath)

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

            if (await this.checkForValidity(fileNode, targetLocation)) {
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

    public createTargetPath(fileNode: S3FileNode): Promise<string> {
        let completePath = readablePath(fileNode)
        completePath = completePath.slice(4) //removes 's3://' from path
        completePath = completePath.slice(undefined, completePath.lastIndexOf('/') + 1) + '[S3]' + fileNode.file.name // add [S3] to the name of the file
        completePath = this._tempLocation! + completePath

        return Promise.resolve(completePath)
    }

    private async createSubFolders(targetPath: string): Promise<boolean> {
        const folderStructure = targetPath.slice(undefined, targetPath.lastIndexOf('/'))
        //fs.mkdirSync(folderStructure, { recursive: true })
        await mkdirp(folderStructure)
        return Promise.resolve(true)
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

    private async removeAndCloseTab(activeTab: S3Tab): Promise<void> {
        let fileNode: S3FileNode | undefined = activeTab.s3FileNode
        fileNode = await this.refreshNode(fileNode)
        if (!fileNode) {
            return
        }

        this.activeTabs.delete(activeTab.fileUri.fsPath)
        this.cacheArns.delete(fileNode.arn)
        await activeTab.focusAndCloseTab()
        try {
            fs.unlinkSync(await this.createTargetPath(fileNode))
        } catch (e) {
            showOutputMessage(e, this.outputChannel)
        }

        await this.listTempFolder()
    }

    private listTempFolder(): Promise<void> {
        getLogger().debug('-------contents in temp:')
        showOutputMessage('-------contents in temp:', this.outputChannel)

        fs.readdirSync(this._tempLocation!).forEach((file: any) => {
            showOutputMessage(` ${file}`, this.outputChannel)
            getLogger().debug(` ${file}`)
        })

        getLogger().debug('-------------------------')
        showOutputMessage('-------------------------', this.outputChannel)
        return Promise.resolve()
    }

    public async createTemp(): Promise<string> {
        this._tempLocation = await makeTemporaryToolkitFolder()
        showOutputMessage(
            localize(
                'AWS.s3.message.tempCreation',
                'Temp folder for FileViewer created with location: {0}',
                this._tempLocation
            ),
            this.outputChannel
        )
        getLogger().info(`Temp folder for FileViewer created with location: ${this._tempLocation}`)
        return this._tempLocation
    }

    public get tempLocation(): string | undefined {
        return this._tempLocation
    }

    private async checkForValidity(fileNode: S3FileNode, targetUri: vscode.Uri): Promise<boolean> {
        const newNode = await this.refreshNode(fileNode)
        if (!newNode) {
            getLogger().error(`FileViewer: Error, refreshNode() returned undefined with file: ${fileNode.file.key}`)
            getLogger().debug(`Cache contains: ${this.cacheArns.toString()}`)
            return false
        }

        fileNode = newNode
        const lastModifiedInS3 = fileNode!.file.lastModified
        const { birthtime } = fs.statSync(targetUri.fsPath)

        getLogger().debug(
            `FileViewer: File ${fileNode.file.name} was last modified in S3: ${lastModifiedInS3}, cached on: ${birthtime}`
        )

        return lastModifiedInS3! <= birthtime
    }
}
