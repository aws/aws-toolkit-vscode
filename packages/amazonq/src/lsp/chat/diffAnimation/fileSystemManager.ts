/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from 'aws-core-vscode/shared'
import { PendingFileWrite } from './types'

export class FileSystemManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private fileWatcher: vscode.FileSystemWatcher | undefined

    constructor(private onFileChange: (uri: vscode.Uri) => Promise<void>) {
        this.setupFileWatcher()
    }

    private setupFileWatcher(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*')

        this.fileWatcher.onDidChange(async (uri) => {
            await this.onFileChange(uri)
        })

        this.fileWatcher.onDidCreate(async (uri) => {
            await this.onFileChange(uri)
        })

        this.disposables.push(this.fileWatcher)

        const changeTextDocumentDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.uri.scheme !== 'file' || event.contentChanges.length === 0) {
                return
            }
            await this.onFileChange(event.document.uri)
        })
        this.disposables.push(changeTextDocumentDisposable)
    }

    public async resolveFilePath(filePath: string): Promise<string | undefined> {
        try {
            if (path.isAbsolute(filePath)) {
                return filePath
            }

            const workspaceFolders = vscode.workspace.workspaceFolders
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return filePath
            }

            for (const folder of workspaceFolders) {
                const absolutePath = path.join(folder.uri.fsPath, filePath)
                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath))
                    return absolutePath
                } catch {
                    // File doesn't exist in this workspace folder, try next
                }
            }

            const defaultPath = path.join(workspaceFolders[0].uri.fsPath, filePath)
            return defaultPath
        } catch (error) {
            getLogger().error(`[FileSystemManager] ❌ Error resolving file path: ${error}`)
            return undefined
        }
    }

    public async normalizeFilePath(pathOrUri: string): Promise<string> {
        try {
            if (pathOrUri.startsWith('file://')) {
                const fsPath = vscode.Uri.parse(pathOrUri).fsPath
                return fsPath
            }

            if (path.isAbsolute(pathOrUri)) {
                return pathOrUri
            }

            try {
                const uri = vscode.Uri.parse(pathOrUri)
                if (uri.scheme === 'file') {
                    return uri.fsPath
                }
            } catch {
                // Not a valid URI, treat as path
            }

            return pathOrUri
        } catch (error) {
            getLogger().error(`[FileSystemManager] ❌ Error normalizing file path: ${error}`)
            return pathOrUri
        }
    }

    public async captureFileContent(filePath: string): Promise<{ content: string; exists: boolean }> {
        try {
            const uri = vscode.Uri.file(filePath)
            const document = await vscode.workspace.openTextDocument(uri)
            const content = document.getText()
            return { content, exists: true }
        } catch (error) {
            return { content: '', exists: false }
        }
    }

    public async prepareFileForWrite(filePath: string, fileExists: boolean): Promise<void> {
        try {
            if (!fileExists) {
                const directory = path.dirname(filePath)
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(directory))
            }
        } catch (error) {
            getLogger().error(`[FileSystemManager] ❌ Failed to prepare file: ${error}`)
            throw error
        }
    }

    public async getCurrentFileContent(filePath: string): Promise<string> {
        try {
            const uri = vscode.Uri.file(filePath)
            const content = await vscode.workspace.fs.readFile(uri)
            return Buffer.from(content).toString('utf8')
        } catch {
            return ''
        }
    }

    public cleanupOldPendingWrites(pendingWrites: Map<string, PendingFileWrite>): number {
        const now = Date.now()
        const timeout = 5 * 60 * 1000

        let cleanedWrites = 0
        for (const [filePath, write] of pendingWrites) {
            if (now - write.timestamp > timeout) {
                pendingWrites.delete(filePath)
                cleanedWrites++
            }
        }

        return cleanedWrites
    }

    public dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose()
        }

        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
