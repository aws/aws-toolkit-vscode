/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as mime from 'mime-types'
import * as telemetry from '../shared/telemetry/telemetry'
import * as S3 from '../shared/clients/s3Client'
import { ext } from '../shared/extensionGlobals'
import { showOutputMessage, showViewLogsMessage } from '../shared/utilities/messages'
import { getLogger } from '../shared/logger'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { localize } from '../shared/utilities/vsCodeUtils'
import { ExtContext } from '../shared/extensions'
import { parse } from '@aws-sdk/util-arn-parser'

const SIZE_LIMIT = 4 * Math.pow(10, 6) // 4 MB
const CACHE_PATH = path.join('cache', 's3')

export interface S3Tab {
    dispose(): Promise<void>
    readonly mode: 'read' | 'edit'
    readonly editor: vscode.TextEditor
    readonly file: S3File
}

interface S3File extends S3.File {
    readonly bucket: S3.Bucket
}

interface CacheElement {
    dispose(): Promise<void>
    readonly location: vscode.Uri
    readonly eTag: string
}

export class S3FileViewerManager {
    private readonly cachePath: string
    private readonly arnCache: { [arn: string]: CacheElement | undefined } = {}
    private readonly activeTabs: { [fsPath: string]: S3Tab | undefined } = {}
    private promptOnEdit = true
    //onDidChange to trigger refresh of contents on the document provider
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }

    public constructor(private readonly context: ExtContext) {
        this.cachePath = path.join(context.extensionContext.globalStoragePath, CACHE_PATH)
        context.extensionContext.subscriptions.push(this)
    }

    /**
     * Removes all active editors as well as any underlying files
     */
    public async dispose(): Promise<void> {
        await Promise.all([
            ...Object.values(this.arnCache).map(v => v?.dispose()),
            ...Object.values(this.activeTabs).map(v => v?.dispose()),
        ])
        // We could technically check what editors are open and save those to restore later, though probably not worth it.
    }

    private registerForDocumentSave(tab: S3Tab): vscode.Disposable {
        let ongoingUpload = false

        const saveFile = async () => {
            const cached = this.arnCache[tab.file.arn]
            if (!cached) {
                throw new Error('Invalid state: cached file is expected to exist')
            }

            // TODO: show diff view
            if (!(await this.isValidFile(tab.file, cached.eTag))) {
                const cancelUpload = localize('AWS.s3.fileViewer.button.cancelUpload', 'Cancel download')
                const overwrite = localize('AWS.s3.fileViewer.button.overwrite', 'Overwrite')

                const response = await vscode.window.showWarningMessage(
                    localize(
                        'AWS.s3.fileViewer.error.invalidUpload',
                        'File has changed in S3 since last cache download. Compare your version with the one in S3, then choose to overwrite it or cancel this upload.'
                    ),
                    cancelUpload,
                    overwrite
                )
                if (response !== overwrite) {
                    telemetry.recordS3UploadObject({ result: 'Cancelled', component: 'viewer' })
                    return
                }
            }

            const { eTag } = await this.uploadChangesToS3(tab)
            this.arnCache[tab.file.arn] = { ...cached, eTag }
            this._onDidChange.fire(tab.editor.document.uri.with({ scheme: 's3' }))
        }

        // TODO: dispose of tab after the document is closed (the text editor is stale at that point)
        return vscode.workspace.onDidSaveTextDocument(async doc => {
            if (ongoingUpload || doc.fileName !== tab.editor.document.fileName) {
                return
            }

            ongoingUpload = true
            await saveFile().finally(() => (ongoingUpload = false))
        })
    }

    /**
     * Opens a new editor, closing the previous one if it exists
     */
    private async openEditor(file: S3File, mode: S3Tab['mode']): Promise<vscode.TextEditor | undefined> {
        const fsPath = this.arnToFsPath(file.arn)
        await this.activeTabs[fsPath]?.dispose()

        const fileUri = await this.getFile(file)
        if (!fileUri) {
            return
        }

        // Defer to `vscode.open` for non-text files
        const contentType = mime.contentType(path.extname(fsPath))
        if (contentType && mime.charset(contentType) != 'UTF-8') {
            await vscode.commands.executeCommand('vscode.open', fileUri)
            return vscode.window.visibleTextEditors.find(e => e.document.fileName === fsPath)
        }

        const targetUri = mode === 'read' ? fileUri.with({ scheme: 's3' }) : fileUri
        const document = await vscode.workspace.openTextDocument(targetUri)
        return await vscode.window.showTextDocument(document, { preview: mode === 'read' })
    }

    private async closeEditor(editor: vscode.TextEditor): Promise<void> {
        await vscode.window.showTextDocument(editor.document, { preserveFocus: false })
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    private async tryFocusTab(fsPath: string): Promise<S3Tab | undefined> {
        const activeTab = this.activeTabs[fsPath]

        if (activeTab) {
            getLogger().verbose(`S3FileViewer: Editor already opened, refocusing`)
            await vscode.window.showTextDocument(activeTab.editor.document)
        }

        return activeTab
    }

    /**
     * Given an S3FileNode, this function:
     * Checks and creates a cache to store downloads
     * Retrieves previously cached files on cache and
     * Downloads file from S3 ands stores in cache
     * Opens the tab on read-only with the use of an S3Tab, or shifts focus to an edit tab if any.
     *
     * @param fileNode
     */
    public async openInReadMode(file: S3File): Promise<void> {
        getLogger().verbose(`S3FileViewer: Retrieving and displaying file: ${file.key}`)

        const fsPath = this.arnToFsPath(file.arn)
        if (await this.tryFocusTab(fsPath)) {
            return
        }

        const editor = await this.openEditor(file, 'read')
        if (!editor) {
            return // Throw here?
        }

        this.activeTabs[fsPath] = {
            file,
            editor,
            mode: 'read',
            dispose: async () => await this.closeEditor(editor),
        }
    }

    private async showEditNotification(): Promise<void> {
        if (this.promptOnEdit) {
            const message = localize(
                'AWS.s3.fileViewer.warning.editStateWarning',
                'You are now editing an S3 file. Saved changes will be uploaded to your S3 bucket.'
            )

            const dontShow = localize('AWS.s3.fileViewer.button.dismiss', "Don't show this again")
            const help = localize('AWS.generic.message.learnMore', 'Learn more')

            await vscode.window.showWarningMessage(message, dontShow, help).then(selection => {
                if (selection === dontShow) {
                    // TODO: save selection in memento
                    this.promptOnEdit = false
                }

                if (selection === help) {
                    //TODO: add help section
                }
            })
        }
    }

    /**
     * Given an S3FileNode or an URI, this function:
     * Checks and creates a cache to store downloads
     * Retrieves previously cached files on cache and
     * Downloads file from S3 ands stores in cache
     * Opens the tab on read-only with the use of an S3Tab, or shifts focus to an edit tab if any.
     *
     * @param uriOrNode to be opened
     */
    public async openInEditMode(uriOrNode: vscode.Uri | S3File): Promise<void> {
        const fsPath = uriOrNode instanceof vscode.Uri ? uriOrNode.fsPath : this.arnToFsPath(uriOrNode.arn)
        const activeTab = await this.tryFocusTab(fsPath)

        if (!activeTab && uriOrNode instanceof vscode.Uri) {
            throw new Error('Cannot open from URI without an active tab')
        }
        if (activeTab?.mode === 'edit') {
            return
        }

        this.showEditNotification()

        const activeFile = activeTab?.file ?? (uriOrNode as S3File)
        const editor = await this.openEditor(activeFile, 'edit')
        if (!editor) {
            return // Throw here?
        }

        const newTab: S3Tab = {
            editor,
            file: activeFile,
            mode: 'edit',
            dispose: async () => {
                await this.closeEditor(editor)
                onSave.dispose()
            },
        }
        const onSave = this.registerForDocumentSave(newTab)
        this.activeTabs[fsPath] = newTab
    }

    /**
     * Fetches a file from S3 or gets it from the local cache if possible and still valid (this.checkForValidity()).
     *
     * @see S3FileViewerManager.isValidFile()
     */
    public async getFile(file: S3File): Promise<vscode.Uri | undefined> {
        if (!file.eTag) {
            throw new Error('Unable to use file without eTag')
        }

        const targetPath = this.arnToFsPath(file.arn)
        const targetLocation = vscode.Uri.file(targetPath)

        const tempFile = await this.fromCache(file)
        //If it was found in temp, return the Uri location
        if (tempFile) {
            return tempFile
        }

        const fileSize = file.sizeBytes
        const warningMessage = (function () {
            if (fileSize === undefined) {
                getLogger().debug(`FileViewer: File size couldn't be determined, prompting user file: ${file.name}`)

                return localize(
                    'AWS.s3.fileViewer.warning.noSize',
                    "File size couldn't be determined. Continue with download?"
                )
            } else if (fileSize > SIZE_LIMIT) {
                getLogger().debug(`FileViewer: File size ${fileSize} is >4MB, prompting user`)

                return localize('AWS.s3.fileViewer.warning.4mb', 'File size is more than 4MB. Continue with download?')
            }
        })()

        if (warningMessage && !(await this.showDownloadConfirmation(warningMessage))) {
            telemetry.recordS3DownloadObject({ result: 'Cancelled', component: 'viewer' })
            return
        }

        const downloadedFile = await this.downloadFile(file)
        this.arnCache[file.arn] = {
            dispose: async () => {
                await fs.unlink(downloadedFile.fsPath)
                delete this.arnCache[file.arn]
            },
            eTag: file.eTag,
            location: downloadedFile,
        }

        getLogger().debug(`New cached file: ${file.arn}`)
        return targetLocation
    }

    /**
     * Searches for given node previously downloaded to cache.
     * Ensures that the cached download is still valid (hasn't been modified in S3 since its caching)
     *
     * @param fileNode - Node to be searched in temp
     * @returns Location in temp directory, if any
     */
    private async fromCache(file: S3File): Promise<vscode.Uri | undefined> {
        const cachedFile = this.arnCache[file.arn]

        if (!cachedFile) {
            return
        }

        getLogger().debug(`FileViewer: found file ${file.key} in cache`)
        const isValid = await this.isValidFile(file, cachedFile.eTag)

        if (isValid) {
            return cachedFile.location
        }

        getLogger().debug(`FileViewer: invalid cached file: ${cachedFile.location.fsPath}`)
        await cachedFile.dispose()
    }

    /**
     * Downloads a new file to disk and updates the cache
     * @param fileNode
     * @returns
     */
    private async downloadFile(file: S3File): Promise<vscode.Uri> {
        const targetUri = vscode.Uri.file(this.arnToFsPath(file.arn))
        await fs.mkdirp(path.dirname(targetUri.fsPath))

        try {
            //await downloadWithProgress(fileNode, targetUri)
            await ext.toolkitClientBuilder.createS3Client(file.bucket.region).downloadFile({
                bucketName: file.bucket.name,
                key: file.key,
                saveLocation: targetUri,
            })
            telemetry.recordS3DownloadObject({ result: 'Succeeded', component: 'viewer' })
            return targetUri
        } catch (err) {
            telemetry.recordS3DownloadObject({ result: 'Failed', component: 'viewer' })
            throw err
        }
    }

    private async showDownloadConfirmation(warningMessage: string): Promise<boolean> {
        const args = {
            prompt: warningMessage,
            confirm: localize('AWS.generic.continueDownload', 'Continue with download'),
            cancel: localize('AWS.generic.cancel', 'Cancel'),
        }

        if (!(await showConfirmationMessage(args))) {
            getLogger().debug(`FileViewer: User cancelled download`)
            showOutputMessage(
                localize('AWS.s3.fileViewer.message.downloadCancelled', 'Download cancelled'),
                this.context.outputChannel
            )
            return false
        }

        return true
    }

    /**
     * Checks if the local eTag matches the remote
     */
    private async isValidFile(file: S3File, localTag: string): Promise<boolean> {
        const client = ext.toolkitClientBuilder.createS3Client(file.bucket.region)
        const remoteTag = (await client.headObject({ bucketName: file.bucket.name, key: file.key })).ETag

        return remoteTag === localTag
    }

    /**
     * Uploads current uri back to parent
     *
     * @throws when uploading fails
     */
    private async uploadChangesToS3(tab: S3Tab): Promise<{ eTag: string }> {
        const client = ext.toolkitClientBuilder.createS3Client(tab.file.bucket.region)
        const result = await client
            .uploadFile({
                bucketName: tab.file.bucket.name,
                key: tab.file.key,
                fileLocation: tab.editor.document.uri,
            })
            .then(u => u.promise())

        await vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
        return { eTag: result.ETag }
    }

    private arnToFsPath(arn: string): string {
        const parts = parse(arn)
        const fileName = path.basename(parts.resource)
        return path.join(this.cachePath, path.dirname(parts.resource), `[S3]${fileName}`)
    }
}
