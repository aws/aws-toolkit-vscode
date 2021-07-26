/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as mime from 'mime-types'
import { mkdirp } from 'fs-extra'
import { OutputChannel } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { showOutputMessage } from '../../shared/utilities/messages'
import { Commands } from '../../shared/vscode/commands'
import { downloadWithProgress } from '../commands/downloadFileAs'
import { S3FileNode } from '../explorer/s3FileNode'
import { readablePath } from '../util'
import { getLogger } from '../../shared/logger'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { uploadWithProgress } from '../commands/uploadFile'

const SIZE_LIMIT = 4 * Math.pow(10, 6)
export interface S3Tab {
    fileUri: vscode.Uri
    s3Uri: vscode.Uri
    editor: vscode.TextEditor | undefined
    s3FileNode: S3FileNode
}
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
                    if (!(await this.uploadChangesToS3(activeTab))) {
                        this.window.showErrorMessage(
                            'Error uploading file to S3. Changes will not be saved. Please try and resave this edit mode file'
                        )
                        return
                    }
                    //refresh the activeTab.s3FileNode?
                    const fileNode = await this.refreshNode(activeTab.s3FileNode)

                    await this.removeAndCloseTab(activeTab)
                    await this.openTab(fileNode)
                    this._onDidChange.fire(activeTab.s3Uri)
                } else {
                    window.showErrorMessage(
                        localize(
                            'AWS.s3.fileViewer.error.invalidUpload',
                            'File is invalid to upload, file has changed in S3 since last cache download. Please try and reopen the file. Be aware current changes may be lost.'
                        )
                    )
                }
            }
        })

        // this.window.onDidChangeVisibleTextEditors(editors => {
        //     //const editorSet = new Set(editors)
        //     // for (const value of this.activeTabs.values()) {
        //     //     //if visible text editors don't contain a given S3Tab anymore,
        //     //     //set the S3Tab.editor to undefined
        //     //     if (value.editor) {
        //     //         if (!editorSet.has(value.editor)) {
        //     //             value.editor = undefined
        //     //         }
        //     //     }
        //     // }
        // })
    }

    public async getActiveEditor(targetUri: vscode.Uri): Promise<vscode.TextEditor | undefined> {
        const visibleEditor = this.window.visibleTextEditors
        return visibleEditor.find((editor: vscode.TextEditor) => editor.document.uri.fsPath === targetUri.fsPath)
    }

    public async focusAndCloseTab(uri: vscode.Uri): Promise<void> {
        const editor = await this.getActiveEditor(uri)
        if (!editor) {
            return
        }
        await this.window.showTextDocument(editor.document, {
            preview: false,
            viewColumn: editor.viewColumn,
        })
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    /**
     * Given an S3FileNode, this function:
     * Checks and creates a cache to store downloads
     * Retrieves previously cached files on cache and
     * Downloads file from S3 ands stores in cache
     * Opens the tab on read-only with the use of an S3Tab, or shifts focus to an edit tab if any.
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
        const headResponse = await fileNode.s3.getHeadObject({
            bucketName: fileNode.bucket.name,
            key: fileNode.file.key,
        })

        const fileLocation = await this.getFile(fileNode)
        if (!fileLocation) {
            return
        }
        getLogger().verbose(`S3FileViewer: File from s3 or temp to be opened is: ${fileLocation}`)
        const s3Uri = vscode.Uri.parse('s3:' + fileLocation.fsPath)

        //before opening, ask user how to handle it if it is not text
        const type = mime.contentType(headResponse.ContentType!)
        const charset = mime.charset(type as string)

        if (charset != 'UTF-8') {
            const prompt = "Can't open this file type in read-only mode, do you want to try opening in edit?"
            const edit = 'Open in edit mode'
            const read = 'Try in read-only'
            if (await showConfirmationMessage({ prompt, confirm: edit, cancel: read }, this.window)) {
                return await this.openInEditMode(fileNode)
            }
        }
        const editor = await this.openFileInReadOnly(fileLocation)

        const newTab =
            this.activeTabs.get(fileLocation.fsPath) ??
            ({ fileUri: fileLocation, s3Uri, editor, s3FileNode: fileNode } as S3Tab)

        this.activeTabs.set(fileLocation.fsPath, newTab)
    }

    public async openFileInReadOnly(
        uri: vscode.Uri,
        workspace = vscode.workspace
    ): Promise<vscode.TextEditor | undefined> {
        const s3Uri = vscode.Uri.parse('s3:' + uri.fsPath)

        //find if there is any active editor for this uri
        const openEditor = await this.getActiveEditor(s3Uri)

        try {
            const doc = await workspace.openTextDocument(s3Uri)
            if (!openEditor) {
                //there wasn't any open, just display it regularly
                return await this.window.showTextDocument(doc, { preview: false })
            } else if (openEditor.document.uri.scheme === 'file' || openEditor.document.uri.scheme === s3Uri.scheme) {
                //there is a tab for this uri scheme open, just shift focus to it by reopening it with the ViewColumn option
                return await this.window.showTextDocument(openEditor.document, {
                    preview: false,
                    viewColumn: openEditor.viewColumn,
                })
            } else {
                // there is already a tab open, it needs to be focused, then closed
                await this.focusAndCloseTab(uri)
                //good to open in given mode
                return await this.window.showTextDocument(doc, { preview: false })
            }
        } catch (e) {
            this.window.showErrorMessage(`Error opening file ${e}`)
            return undefined
        }
    }

    public async openInEditMode(uriOrNode: vscode.Uri | S3FileNode): Promise<void> {
        if (this.promptOnEdit) {
            const message = localize(
                'AWS.s3.fileViewer.warning.editStateWarning',
                'Opening S3 file for editing. Saved changes will be written directly to the original location in S3.'
            )

            const dontShow = localize('AWS.s3.fileViewer.button.dismiss', "Don't show this again")
            const help = localize('AWS.s3.fileViewer.button.help', 'Help')

            this.window.showWarningMessage(message, dontShow, help).then(selection => {
                if (selection === dontShow) {
                    this.promptOnEdit = false
                }

                if (selection === help) {
                    //TODO: add help section
                }
            })
        }
        if (uriOrNode instanceof vscode.Uri) {
            //was activated from an open tab
            if (this.activeTabs.has(uriOrNode.fsPath)) {
                const tab = this.activeTabs.get(uriOrNode.fsPath)
                await this.openFileInEditMode(uriOrNode)

                this.activeTabs.set(uriOrNode.fsPath, tab!)
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
            const s3Uri = vscode.Uri.parse(fileLocation.fsPath)
            const editor = await this.openFileInEditMode(fileLocation)

            const tab =
                this.activeTabs.get(fileLocation.fsPath) ??
                ({ fileUri: fileLocation, s3Uri, editor, s3FileNode: uriOrNode } as S3Tab) //new S3Tab(fileLocation, uriOrNode)

            this.activeTabs.set(tab.fileUri.fsPath, tab)
        }
    }

    public async openFileInEditMode(
        uri: vscode.Uri,
        workspace = vscode.workspace
    ): Promise<vscode.TextEditor | undefined> {
        //await this.openFile(this.fileUri, workspace)
        const openEditor = await this.getActiveEditor(uri)
        if (openEditor && openEditor.document.uri.scheme === 'file') {
            //shift focus
            const doc = await workspace.openTextDocument(uri)
            return await this.window.showTextDocument(doc, { preview: false })
        } else {
            return vscode.commands.executeCommand('workbench.action.quickOpen', uri.fsPath)
        }
    }

    /**
     * Fetches a file from S3 or gets it from the local cache if possible and still valid (this.checkForValidity()).
     *
     * @see S3FileViewerManager.checkForValidity()
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

    /**
     * Gets the latest instance of given fileNode
     *
     * @param fileNode
     * @returns
     */
    async refreshNode(fileNode: S3FileNode): Promise<S3FileNode> {
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

        this.activeTabs.delete(activeTab.fileUri.fsPath)
        this.cacheArns.delete(fileNode.arn)
        await this.focusAndCloseTab(activeTab.fileUri)
        try {
            fs.unlinkSync(await this.createTargetPath(fileNode))
        } catch (e) {
            showOutputMessage(e, this.outputChannel)
        }
    }

    public async createTemp(): Promise<string> {
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
        return this._tempLocation!
    }

    public get tempLocation(): string | undefined {
        return this._tempLocation
    }

    public set tempLocation(temp: string | undefined) {
        this._tempLocation = temp
    }

    /**
     * Checks that the cached date is after the last modified date in S3.
     * If not, file targetUri is invalid and needs to be redownloaded.
     *
     * @param fileNode instance in S3
     * @param targetUri file downloaded in system
     * @returns
     */
    private async checkForValidity(fileNode: S3FileNode, targetUri: vscode.Uri): Promise<boolean> {
        const newNode = await this.refreshNode(fileNode)
        if (!newNode) {
            getLogger().error(`FileViewer: Error, refreshNode() returned undefined with file: ${fileNode.file.key}`)
            getLogger().debug(`Cache contains: ${this.cacheArns.toString()}`)
            return false
        }

        const lastModifiedInS3 = newNode.file.lastModified
        const { birthtime } = fs.statSync(targetUri.fsPath)

        getLogger().debug(
            `FileViewer: File ${newNode.file.name} was last modified in S3: ${lastModifiedInS3}, cached on: ${birthtime}`
        )

        if (!lastModifiedInS3) {
            getLogger().error(`S3FileViewer: FileNode has not last modified date, file node: ${fileNode.toString()}`)
            return false
        }

        return lastModifiedInS3 <= birthtime
    }

    /**
     * Uploads current uri back to parent
     *
     * @returns true if upload succe]
     */
    public async uploadChangesToS3(tab: S3Tab): Promise<boolean> {
        const request = {
            bucketName: tab.s3FileNode.bucket.name,
            key: tab.s3FileNode.parent.path + tab.s3FileNode.name,
            fileLocation: tab.fileUri,
            fileSizeBytes: tab.s3FileNode.file.sizeBytes!,
            s3Client: tab.s3FileNode.s3,
            window: this.window,
        }
        try {
            await uploadWithProgress(request)
        } catch (e) {
            //error with upload
            return false
        }
        return true
    }
}
