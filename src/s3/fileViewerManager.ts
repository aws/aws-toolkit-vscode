/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as mime from 'mime-types'
import * as S3 from '../shared/clients/s3Client'
import { getLogger } from '../shared/logger'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { localize, openUrl } from '../shared/utilities/vsCodeUtils'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { downloadFile } from './commands/downloadFileAs'
import { s3FileViewerHelpUrl } from '../shared/constants'
import { FileProvider, VirtualFileSystem } from '../shared/virtualFilesystem'
import { PromptSettings } from '../shared/settings'
import { telemetry } from '../shared/telemetry/telemetry'
import { ToolkitError } from '../shared/errors'

export const s3EditScheme = 's3'
export const s3ReadScheme = 's3-readonly'
export const enum TabMode {
    Read = 'read',
    Edit = 'edit',
}

const sizeLimit = 4 * Math.pow(10, 6) // 4 MB
const promptOnEditKey = 'fileViewerEdit'

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
        this._file.sizeBytes = stats.ContentLength ?? this._file.sizeBytes
        this._file.lastModified = stats.LastModified
        this._file.ContentType = stats.ContentType
    }

    public async read(): Promise<Uint8Array> {
        return telemetry.s3_downloadObject.run(span => {
            span.record({ component: 'viewer' })

            const result = downloadFile(this._file, {
                client: this.client,
                progressLocation:
                    (this._file.sizeBytes ?? 0) < sizeLimit
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

            const mimeType = mime.contentType(path.extname(this._file.name)) || undefined
            const result = await this.client
                .uploadFile({
                    content,
                    key: this._file.key,
                    bucketName: this._file.bucket.name,
                    contentType: this._file.ContentType ?? mimeType,
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
        private readonly fs: VirtualFileSystem,
        private readonly settings = PromptSettings.instance,
        private readonly schemes = { read: s3ReadScheme, edit: s3EditScheme }
    ) {
        this.disposables.push(this.registerTabCleanup())
    }

    /** Disposes all active editors and underlying files. */
    public async closeEditors(): Promise<void> {
        await Promise.all([...Object.values(this.activeTabs).map(v => v?.dispose())])
    }

    /** Disposes all active editors, underlying files, providers, and other resources. */
    public async dispose(): Promise<void> {
        await Promise.all([
            ...Object.values(this.activeTabs).map(v => v?.dispose()),
            ...Object.values(this.providers).map(v => v?.dispose()),
        ])
        vscode.Disposable.from(...this.disposables).dispose()
    }

    private registerTabCleanup(): vscode.Disposable {
        return vscode.workspace.onDidCloseTextDocument(async doc => {
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

        try {
            // Defer to `vscode.open` for non-text files
            const contentType = mime.contentType(path.extname(fsPath))
            if (!contentType || mime.charset(contentType) !== 'UTF-8') {
                await vscode.commands.executeCommand('vscode.open', fileUri)
                return vscode.window.visibleTextEditors.find(
                    e => this.fs.uriToKey(e.document.uri) === this.fs.uriToKey(fileUri)
                )
            }

            const document = await vscode.workspace.openTextDocument(fileUri)
            return await vscode.window.showTextDocument(document, options)
        } catch (err) {
            throw ToolkitError.chain(err, 'Failed to open document', { code: 'FailedToOpen' })
        }
    }

    private async closeEditor(editor: vscode.TextEditor | undefined): Promise<void> {
        if (editor && !editor.document.isClosed) {
            await vscode.window.showTextDocument(editor.document, { preserveFocus: false }).then(
                r => vscode.commands.executeCommand('workbench.action.closeActiveEditor'),
                e => {
                    getLogger().warn('S3FileViewer: showTextDocument failed to open: "%s"', editor.document.uri)
                }
            )
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
                await vscode.window.showTextDocument(activeTab.editor.document)
            } else {
                getLogger().verbose(`S3FileViewer: Reopening non-text document`)
                await vscode.commands.executeCommand('vscode.open', uri)
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
    public async openInReadMode(file: S3File): Promise<S3Tab | undefined> {
        const contentType = mime.contentType(path.extname(file.name))
        const isTextDocument = contentType && mime.charset(contentType) === 'UTF-8'

        const uri = this.fileToUri(file, TabMode.Read)
        if (await this.tryFocusTab(uri, uri.with({ scheme: this.schemes.edit }))) {
            return
        }

        if (!isTextDocument) {
            getLogger().warn(`Unable to determine if ${file.name} is a text document, opening in edit-mode`)
            return this.openInEditMode(file)
        }

        return this.createTab(file, TabMode.Read)
    }

    /**
     * Opens the tab in edit mode with the use of an S3Tab, or shifts focus to an edit tab if any.
     * Existing read-only tabs are closed as they cannot be converted to edit tabs.
     *
     * @param uriOrFile to be opened
     */
    public async openInEditMode(uriOrFile: vscode.Uri | S3File): Promise<S3Tab | undefined> {
        const uri = uriOrFile instanceof vscode.Uri ? uriOrFile : this.fileToUri(uriOrFile, TabMode.Edit)
        const activeTab = await this.tryFocusTab(uri, uri.with({ scheme: this.schemes.read }))
        const file = activeTab?.file ?? uriOrFile

        if (activeTab?.mode === TabMode.Edit) {
            return
        }

        if (file instanceof vscode.Uri) {
            throw new Error('Unable to open file in edit mode without a valid editor.')
        }

        await activeTab?.dispose()
        void this.showEditNotification()

        return this.createTab(file, TabMode.Edit)
    }

    private registerProvider(file: S3File, uri: vscode.Uri): vscode.Disposable {
        const provider = new S3FileProvider(this.clientFactory(file.bucket.region), file)

        return vscode.Disposable.from(
            this.fs.registerProvider(uri, provider),
            provider.onDidChange(() => {
                // TODO: find the correct node instead of refreshing it all
                void vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
            })
        )
    }

    /**
     * Creates a new tab based on the mode
     */
    private async createTab(file: S3File, mode: TabMode): Promise<S3Tab | undefined> {
        if (!(await this.canContinueDownload(file))) {
            throw new CancellationError('user')
        }

        const uri = this.fileToUri(file, mode)
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

        return this.activeTabs[key]
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
            } else if (fileSize > sizeLimit) {
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

        if (!(await showConfirmationMessage(args))) {
            getLogger().debug(`FileViewer: User cancelled download`)
            return false
        }

        return true
    }

    private async showEditNotification(): Promise<void> {
        if (!(await this.settings.isPromptEnabled(promptOnEditKey))) {
            return
        }

        const message = localize(
            'AWS.s3.fileViewer.warning.editStateWarning',
            'You are now editing an S3 file. Saved changes will be uploaded to your S3 bucket.'
        )

        const dontShow = localize('AWS.s3.fileViewer.button.dismiss', "Don't show again")
        const help = localize('AWS.generic.message.learnMore', 'Learn more')

        await vscode.window.showWarningMessage(message, dontShow, help).then<unknown>(selection => {
            if (selection === dontShow) {
                return this.settings.disablePrompt(promptOnEditKey)
            }

            if (selection === help) {
                return openUrl(vscode.Uri.parse(s3FileViewerHelpUrl, true))
            }
        })
    }

    private fileToUri(file: S3File, mode: TabMode): vscode.Uri {
        const scheme = mode === TabMode.Read ? this.schemes.read : this.schemes.edit

        return vscode.Uri.parse(`${scheme}:`, true).with({
            path: ['', file.bucket.region, file.bucket.name, file.key].join('/'),
        })
    }
}
