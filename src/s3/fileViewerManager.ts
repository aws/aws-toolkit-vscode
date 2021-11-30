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
import { showOutputMessage } from '../shared/utilities/messages'
import { getLogger } from '../shared/logger'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { localize } from '../shared/utilities/vsCodeUtils'
import { ExtContext } from '../shared/extensions'
import { parse } from '@aws-sdk/util-arn-parser'
import { TimeoutError } from '../shared/utilities/timeoutUtils'
import { downloadFile } from './commands/downloadFileAs'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'
import { s3FileViewerHelpUrl } from '../shared/constants'
import { FileProvider, MemoryFileSystem } from '../shared/memoryFilesystem'

const SIZE_LIMIT = 4 * Math.pow(10, 6) // 4 MB
const PROMPT_ON_EDIT_KEY = 'fileViewerEdit'

export interface S3Tab {
    dispose(): Promise<void> | void
    readonly mode: 'read' | 'edit'
    readonly editor: vscode.TextEditor | undefined
    readonly file: S3File
}

interface S3File extends S3.File {
    readonly bucket: S3.Bucket
}

export class S3FileViewerManager {
    private readonly activeTabs: { [uri: string]: S3Tab | undefined } = {}
    private readonly providers: { [uri: string]: vscode.Disposable | undefined } = {}

    public constructor(private readonly context: ExtContext, private readonly fs: MemoryFileSystem) {
        context.extensionContext.subscriptions.push(this)
    }

    /**
     * Removes all active editors as well as any underlying files
     */
    public async dispose(): Promise<void> {
        await Promise.all(Object.values(this.activeTabs).map(v => v?.dispose()))
    }

    private async promptConflicts(file: S3File): Promise<boolean> {
        const isValid = file.eTag && (await this.isValidFile(file, file.eTag))

        if (isValid) {
            return true
        }

        // TODO: show diff view
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

        return response === overwrite
    }

    /**
     * Opens a new editor, closing the previous one if it exists
     */
    private async openEditor(
        fileUri: vscode.Uri,
        options?: vscode.TextDocumentShowOptions
    ): Promise<vscode.TextEditor | undefined> {
        const fsPath = fileUri.fsPath

        await this.activeTabs[this.fs.uriToKey(fileUri)]?.dispose()

        // Defer to `vscode.open` for non-text files
        const contentType = mime.contentType(path.extname(fsPath))
        if (contentType && mime.charset(contentType) != 'UTF-8') {
            // We cannot use `vscode.open` with read-only files
            await vscode.commands.executeCommand('vscode.open', fileUri)
            return vscode.window.visibleTextEditors.find(
                e => this.fs.uriToKey(e.document.uri) === this.fs.uriToKey(fileUri)
            )
        }

        const document = await vscode.workspace.openTextDocument(fileUri)
        return await vscode.window.showTextDocument(document, options)
    }

    private async closeEditor(editor: vscode.TextEditor): Promise<void> {
        await vscode.window.showTextDocument(editor.document, { preserveFocus: false })
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    private async tryFocusTab(uri: vscode.Uri): Promise<S3Tab | undefined> {
        const activeTab = this.activeTabs[this.fs.uriToKey(uri)]

        if (activeTab?.editor) {
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
        const uri = this.fileToUri(file, 'read')
        if (await this.tryFocusTab(uri)) {
            return
        }

        await this.createTab(file, 'read')
    }

    private async showEditNotification(): Promise<void> {
        const settings = new DefaultSettingsConfiguration()

        if (!(await settings.isPromptEnabled(PROMPT_ON_EDIT_KEY))) {
            return
        }

        const message = localize(
            'AWS.s3.fileViewer.warning.editStateWarning',
            'You are now editing an S3 file. Saved changes will be uploaded to your S3 bucket.'
        )

        const dontShow = localize('AWS.s3.fileViewer.button.dismiss', "Don't show this again")
        const help = localize('AWS.generic.message.learnMore', 'Learn more')

        await vscode.window.showWarningMessage(message, dontShow, help).then<unknown>(selection => {
            if (selection === dontShow) {
                return settings.disablePrompt(PROMPT_ON_EDIT_KEY)
            }

            if (selection === help) {
                return vscode.env.openExternal(vscode.Uri.parse(s3FileViewerHelpUrl, true))
            }
        })
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
        const uri = uriOrNode instanceof vscode.Uri ? uriOrNode : this.fileToUri(uriOrNode, 'edit')
        const activeTab = await this.tryFocusTab(uri)

        if (!activeTab && uriOrNode instanceof vscode.Uri) {
            throw new Error('Cannot open from URI without an active tab')
        }
        if (activeTab?.mode === 'edit') {
            return
        }

        this.showEditNotification()

        const activeFile = activeTab?.file ?? (uriOrNode as S3File)
        await this.createTab(activeFile, 'edit')
    }

    private async registerProvider(file: S3File, uri: vscode.Uri): Promise<vscode.Disposable> {
        const onDidChangeEmitter = new vscode.EventEmitter<void>()
        const fileCopy = { ...file }

        const provider: FileProvider = {
            onDidChange: onDidChangeEmitter.event,
            read: () => this.downloadFile(file),
            write: async () => {
                const canWrite = await this.promptConflicts(fileCopy)
                if (!canWrite) {
                    telemetry.recordS3UploadObject({ result: 'Cancelled', component: 'viewer' })
                    throw vscode.FileSystemError.Unavailable('Cannot write')
                }
                await this.uploadChangesToS3(fileCopy, uri)
                onDidChangeEmitter.fire()
            },
            stat: async () => {
                const client = ext.toolkitClientBuilder.createS3Client(file.bucket.region)
                const stats = await client.headObject({ bucketName: file.bucket.name, key: file.key })

                fileCopy.eTag = stats.ETag
                fileCopy.sizeBytes = stats.ContentLength
                fileCopy.lastModified = stats.LastModified

                return {
                    ctime: 0,
                    mtime: stats.LastModified?.getTime() ?? 0,
                }
            },
        }

        return await this.fs.registerProvider(uri, provider)
    }

    /**
     * Creates a new tab based on the mode
     */
    private async createTab(file: S3File, mode: S3Tab['mode']): Promise<void> {
        if (!(await this.canContinueDownload(file))) {
            throw new TimeoutError('cancelled')
        }
        const uri = this.fileToUri(file, mode)
        const provider = (this.providers[this.fs.uriToKey(uri)] ??= await this.registerProvider(file, uri))
        const editor = await this.openEditor(uri, { preview: mode === 'read' })

        const onDidCloseDocument = vscode.workspace.onDidCloseTextDocument(doc => {
            if (this.fs.uriToKey(doc.uri) === this.fs.uriToKey(editor.document.uri)) {
                provider.dispose()
                delete this.activeTabs[this.fs.uriToKey(uri)]
            }
        })

        const tab: S3Tab = {
            file,
            mode,
            editor,
            dispose: async () => {
                await this.closeEditor(editor)
                onDidCloseDocument.dispose()
                delete this.activeTabs[this.fs.uriToKey(uri)]
            },
        }

        this.activeTabs[this.fs.uriToKey(uri)] = tab
    }

    private async canContinueDownload(file: S3File): Promise<boolean> {
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
            // Technically these errors are for `Timeout` objects though they work fine for cancellations
            //throw new TimeoutError('cancelled')
            return false
        }

        return true
    }

    /**
     * Downloads a new file, recording telemetry
     */
    private async downloadFile(file: S3File): Promise<Buffer> {
        const result = downloadFile(file.bucket, file, {
            progressLocation: vscode.ProgressLocation.Notification,
        })

        result.then(() => {
            telemetry.recordS3DownloadObject({ result: 'Succeeded', component: 'viewer' })
        })
        // TODO: add way to record component on failure/cancel

        return result
    }

    private async showDownloadConfirmation(warningMessage: string): Promise<boolean> {
        const args = {
            prompt: warningMessage,
            confirm: localize('AWS.generic.continueDownload', 'Continue with download'),
            cancel: localize('AWS.generic.cancel', 'Cancel'),
        }

        if (!(await showConfirmationMessage(args))) {
            getLogger().debug(`FileViewer: User cancelled download`)
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
    private async uploadChangesToS3(file: S3File, location: vscode.Uri): Promise<{ eTag: string }> {
        const client = ext.toolkitClientBuilder.createS3Client(file.bucket.region)
        const result = await client
            .uploadFile({
                bucketName: file.bucket.name,
                key: file.key,
                content: await vscode.workspace.fs.readFile(location),
            })
            .then(u => u.promise())

        await vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
        return { eTag: result.ETag }
    }

    private fileToUri(file: S3File, mode: S3Tab['mode']): vscode.Uri {
        const parts = parse(file.arn)
        const fileName = path.basename(parts.resource)

        const contentType = mime.contentType(path.extname(fileName))
        const isTextDocument = contentType && mime.charset(contentType) == 'UTF-8'

        return vscode.Uri.parse(path.join(file.bucket.region, path.dirname(parts.resource), `[S3] ${fileName}`)).with({
            scheme: !isTextDocument ? 's3' : mode === 'read' ? 's3-readonly' : 's3',
        })
    }
}
