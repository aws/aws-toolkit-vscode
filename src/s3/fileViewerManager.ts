/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as mime from 'mime-types'
import * as S3 from '../shared/clients/s3Client'
import { getLogger } from '../shared/logger'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { localize } from '../shared/utilities/vsCodeUtils'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { downloadFile } from './commands/downloadFileAs'
import { s3FileViewerHelpUrl } from '../shared/constants'
import { FileProvider, VirualFileSystem } from '../shared/virtualFilesystem'
import { PromptSettings } from '../shared/settings'
import { telemetry } from '../shared/telemetry/telemetry'

export const S3_EDIT_SCHEME = 's3'
export const S3_READ_SCHEME = 's3-readonly'
export const enum TabMode {
    Read = 'read',
    Edit = 'edit',
}

const SIZE_LIMIT = 4 * Math.pow(10, 6) // 4 MB
const PROMPT_ON_EDIT_KEY = 'fileViewerEdit'

export interface S3Tab {
    dispose(): Promise<void> | void
    readonly mode: TabMode
    readonly file: S3File
    readonly editor: vscode.TextEditor | undefined
}

// TODO: just use this everywhere? A bucket-less S3 file doesn't make sense.
// Combines the File and Bucket interface as they mostly belong together
export interface S3File extends S3.File {
    readonly bucket: S3.Bucket
}

export class S3FileProvider implements FileProvider {
    private readonly _onDidChange = new vscode.EventEmitter<void>()
    private readonly _file: { -readonly [P in keyof S3File]: S3File[P] }
    public readonly onDidChange = this._onDidChange.event

    public constructor(private readonly client: S3.S3Client, file: S3File) {
        this._file = { ...file }
    }

    public async refresh(): Promise<void> {
        const { bucket, key } = this._file
        const stats = await this.client.headObject({ bucketName: bucket.name, key })

        this.updateETag(stats.ETag)
        this._file.sizeBytes = stats.ContentLength
        this._file.lastModified = stats.LastModified
    }

    public async read(): Promise<Uint8Array> {
        return telemetry.s3_downloadObject.run(span => {
            span.record({ component: 'viewer' })

            const result = downloadFile(this._file, {
                client: this.client,
                progressLocation:
                    (this._file.sizeBytes ?? 0) < SIZE_LIMIT
                        ? vscode.ProgressLocation.Window
                        : vscode.ProgressLocation.Notification,
            })

            return result
        })
    }

    public async stat(): Promise<{ ctime: number; mtime: number; size: number }> {
        await this.refresh()

        return {
            ctime: 0,
            size: this._file.sizeBytes ?? 0,
            mtime: this._file.lastModified?.getTime() ?? 0,
        }
    }

    public async write(content: Uint8Array): Promise<void> {
        return telemetry.s3_uploadObject.run(async span => {
            span.record({ component: 'viewer' })

            const result = await this.client
                .uploadFile({
                    content,
                    key: this._file.key,
                    bucketName: this._file.bucket.name,
                    contentType: mime.contentType(path.extname(this._file.name)) || undefined,
                })
                .then(u => u.promise())

            this.updateETag(result.ETag)
            this._file.lastModified = new Date()
            this._file.sizeBytes = content.byteLength
        })
    }

    private updateETag(newTag: string | undefined): void {
        if (this._file.eTag !== newTag) {
            this._onDidChange.fire()
        }
        this._file.eTag = newTag
    }
}

type S3ClientFactory = (region: string) => S3.S3Client

export class S3FileViewerManager {
    private readonly activeTabs: { [uri: string]: S3Tab | undefined } = {}
    private readonly providers: { [uri: string]: vscode.Disposable | undefined } = {}
    private readonly disposables: vscode.Disposable[] = []

    public constructor(
        private readonly clientFactory: S3ClientFactory,
        private readonly fs: VirualFileSystem,
        private readonly window: typeof vscode.window = vscode.window,
        private readonly settings = PromptSettings.instance,
        private readonly commands: typeof vscode.commands = vscode.commands,
        private readonly workspace: typeof vscode.workspace = vscode.workspace
    ) {
        this.disposables.push(this.registerTabCleanup())
    }

    /**
     * Removes all active editors as well as any underlying files
     */
    public async dispose(): Promise<void> {
        await Promise.all([
            ...Object.values(this.activeTabs).map(v => v?.dispose()),
            ...Object.values(this.providers).map(v => v?.dispose()),
        ])
        vscode.Disposable.from(...this.disposables).dispose()
    }

    private registerTabCleanup(): vscode.Disposable {
        return this.workspace.onDidCloseTextDocument(async doc => {
            const key = this.fs.uriToKey(doc.uri)
            await this.activeTabs[key]?.dispose()
        })
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
            await this.commands.executeCommand('vscode.open', fileUri)
            return this.window.visibleTextEditors.find(
                e => this.fs.uriToKey(e.document.uri) === this.fs.uriToKey(fileUri)
            )
        }

        const document = await this.workspace.openTextDocument(fileUri)
        return await this.window.showTextDocument(document, options)
    }

    private async closeEditor(editor: vscode.TextEditor | undefined): Promise<void> {
        if (editor && !editor.document.isClosed) {
            await this.window.showTextDocument(editor.document, { preserveFocus: false })
            await this.commands.executeCommand('workbench.action.closeActiveEditor')
        }
    }

    /**
     * Tries to focus a tab from a list of URIs. First match is returned.
     */
    private async tryFocusTab(...uris: vscode.Uri[]): Promise<S3Tab | undefined> {
        for (const uri of uris) {
            const activeTab = this.activeTabs[this.fs.uriToKey(uri)]

            if (!activeTab) {
                continue
            } else if (activeTab.editor) {
                getLogger().verbose(`S3FileViewer: Editor already opened, refocusing`)
                await this.window.showTextDocument(activeTab.editor.document)
            } else {
                getLogger().verbose(`S3FileViewer: Reopening non-text document`)
                await this.commands.executeCommand('vscode.open', uri)
            }

            return activeTab
        }
    }

    /**
     * Given an {@link S3File}, this function opens the tab on read-only with the use of an S3Tab
     * Focus is shifted to an edit tab if any.
     *
     * @param file
     */
    public async openInReadMode(file: S3File): Promise<void> {
        const contentType = mime.contentType(path.extname(file.name))
        const isTextDocument = contentType && mime.charset(contentType) == 'UTF-8'

        const uri = S3FileViewerManager.fileToUri(file, TabMode.Read)
        if (await this.tryFocusTab(uri, uri.with({ scheme: S3_EDIT_SCHEME }))) {
            return
        }

        if (!isTextDocument) {
            getLogger().warn(`Unable to determine if ${file.name} is a text document, opening in edit-mode`)
            return this.openInEditMode(file)
        }

        await this.createTab(file, TabMode.Read)
    }

    /**
     * Opens the tab in edit mode with the use of an S3Tab, or shifts focus to an edit tab if any.
     * Exiting read-only tabs are closed as they cannot be converted to edit tabs.
     *
     * @param uriOrFile to be opened
     */
    public async openInEditMode(uriOrFile: vscode.Uri | S3File): Promise<void> {
        const uri = uriOrFile instanceof vscode.Uri ? uriOrFile : S3FileViewerManager.fileToUri(uriOrFile, TabMode.Edit)
        const activeTab = await this.tryFocusTab(uri, uri.with({ scheme: S3_READ_SCHEME }))
        const file = activeTab?.file ?? uriOrFile

        if (activeTab?.mode === TabMode.Edit) {
            return
        }

        if (file instanceof vscode.Uri) {
            throw new Error('Unable to open file in edit mode without a valid editor.')
        }

        await activeTab?.dispose()
        this.showEditNotification()

        await this.createTab(file, TabMode.Edit)
    }

    private registerProvider(file: S3File, uri: vscode.Uri): vscode.Disposable {
        const provider = new S3FileProvider(this.clientFactory(file.bucket.region), file)

        return vscode.Disposable.from(
            this.fs.registerProvider(uri, provider),
            provider.onDidChange(() => {
                // TODO: find the correct node instead of refreshing it all
                this.commands.executeCommand('aws.refreshAwsExplorer', true)
            })
        )
    }

    /**
     * Creates a new tab based on the mode
     */
    private async createTab(file: S3File, mode: TabMode): Promise<void> {
        if (!(await this.canContinueDownload(file))) {
            throw new CancellationError('user')
        }

        const uri = S3FileViewerManager.fileToUri(file, mode)
        const key = this.fs.uriToKey(uri)
        const provider = (this.providers[key] ??= this.registerProvider(file, uri))
        const editor = await this.openEditor(uri, { preview: mode === TabMode.Read })

        this.activeTabs[key] = {
            file,
            mode,
            editor,
            dispose: async () => {
                await this.closeEditor(editor)
                delete this.activeTabs[key]
                // Note that providers without an editor will persist for the lifetime of the extension
                // since we have no way of detecting when a webview-type editor closes
                if (editor) {
                    provider.dispose()
                    delete this.providers[key]
                }
            },
        }
    }

    private async canContinueDownload(file: S3File): Promise<boolean> {
        const fileSize = file.sizeBytes
        // JS needs a `when` syntax like Kotlin
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
            return false
        }

        return true
    }

    private async showDownloadConfirmation(warningMessage: string): Promise<boolean> {
        const args = {
            prompt: warningMessage,
            confirm: localize('AWS.generic.continueDownload', 'Continue with download'),
            cancel: localize('AWS.generic.cancel', 'Cancel'),
        }

        if (!(await showConfirmationMessage(args, this.window))) {
            getLogger().debug(`FileViewer: User cancelled download`)
            return false
        }

        return true
    }

    private async showEditNotification(): Promise<void> {
        if (!(await this.settings.isPromptEnabled(PROMPT_ON_EDIT_KEY))) {
            return
        }

        const message = localize(
            'AWS.s3.fileViewer.warning.editStateWarning',
            'You are now editing an S3 file. Saved changes will be uploaded to your S3 bucket.'
        )

        const dontShow = localize('AWS.s3.fileViewer.button.dismiss', "Don't show this again")
        const help = localize('AWS.generic.message.learnMore', 'Learn more')

        await this.window.showWarningMessage(message, dontShow, help).then<unknown>(selection => {
            if (selection === dontShow) {
                return this.settings.disablePrompt(PROMPT_ON_EDIT_KEY)
            }

            if (selection === help) {
                return vscode.env.openExternal(vscode.Uri.parse(s3FileViewerHelpUrl, true))
            }
        })
    }

    private static fileToUri(file: S3File, mode: TabMode): vscode.Uri {
        const scheme = mode === TabMode.Read ? S3_READ_SCHEME : S3_EDIT_SCHEME

        return vscode.Uri.parse(`${scheme}:`, true).with({
            path: ['', file.bucket.region, file.bucket.name, file.key].join('/'),
        })
    }
}
