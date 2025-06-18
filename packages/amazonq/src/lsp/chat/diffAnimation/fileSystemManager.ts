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
        // Set up file system watcher for all files
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*')

        // Watch for file changes
        this.fileWatcher.onDidChange(async (uri) => {
            await this.onFileChange(uri)
        })

        // Watch for file creation
        this.fileWatcher.onDidCreate(async (uri) => {
            await this.onFileChange(uri)
        })

        this.disposables.push(this.fileWatcher)

        // Also listen to text document changes for more immediate detection
        const changeTextDocumentDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.uri.scheme !== 'file' || event.contentChanges.length === 0) {
                return
            }

            // Check if this is an external change (not from user typing)
            if (event.reason === undefined) {
                await this.onFileChange(event.document.uri)
            }
        })
        this.disposables.push(changeTextDocumentDisposable)
    }

    /**
     * Resolve file path to absolute path
     */
    public async resolveFilePath(filePath: string): Promise<string | undefined> {
        getLogger().info(`[FileSystemManager] 🔍 Resolving file path: ${filePath}`)

        try {
            // If already absolute, return as is
            if (path.isAbsolute(filePath)) {
                getLogger().info(`[FileSystemManager] ✅ Path is already absolute: ${filePath}`)
                return filePath
            }

            // Try to resolve relative to workspace folders
            const workspaceFolders = vscode.workspace.workspaceFolders
            if (!workspaceFolders || workspaceFolders.length === 0) {
                getLogger().warn('[FileSystemManager] ⚠️ No workspace folders found')
                return filePath
            }

            // Try each workspace folder
            for (const folder of workspaceFolders) {
                const absolutePath = path.join(folder.uri.fsPath, filePath)
                getLogger().info(`[FileSystemManager] 🔍 Trying: ${absolutePath}`)

                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath))
                    getLogger().info(`[FileSystemManager] ✅ File exists at: ${absolutePath}`)
                    return absolutePath
                } catch {
                    // File doesn't exist in this workspace folder, try next
                }
            }

            // If file doesn't exist yet, return path relative to first workspace
            const defaultPath = path.join(workspaceFolders[0].uri.fsPath, filePath)
            getLogger().info(`[FileSystemManager] 🆕 Using default path for new file: ${defaultPath}`)
            return defaultPath
        } catch (error) {
            getLogger().error(`[FileSystemManager] ❌ Error resolving file path: ${error}`)
            return undefined
        }
    }

    /**
     * Normalize file path from URI or path string
     */
    public async normalizeFilePath(pathOrUri: string): Promise<string> {
        getLogger().info(`[FileSystemManager] 🔧 Normalizing path: ${pathOrUri}`)

        try {
            // Handle file:// protocol
            if (pathOrUri.startsWith('file://')) {
                const fsPath = vscode.Uri.parse(pathOrUri).fsPath
                getLogger().info(`[FileSystemManager] ✅ Converted file:// URI to: ${fsPath}`)
                return fsPath
            }

            // Check if it's already a file path
            if (path.isAbsolute(pathOrUri)) {
                getLogger().info(`[FileSystemManager] ✅ Already absolute path: ${pathOrUri}`)
                return pathOrUri
            }

            // Try to parse as URI
            try {
                const uri = vscode.Uri.parse(pathOrUri)
                if (uri.scheme === 'file') {
                    getLogger().info(`[FileSystemManager] ✅ Parsed as file URI: ${uri.fsPath}`)
                    return uri.fsPath
                }
            } catch {
                // Not a valid URI, treat as path
            }

            // Return as-is if we can't normalize
            getLogger().info(`[FileSystemManager] ⚠️ Using as-is: ${pathOrUri}`)
            return pathOrUri
        } catch (error) {
            getLogger().error(`[FileSystemManager] ❌ Error normalizing file path: ${error}`)
            return pathOrUri
        }
    }

    /**
     * Capture current file content before modification
     */
    public async captureFileContent(filePath: string): Promise<{ content: string; exists: boolean }> {
        try {
            const uri = vscode.Uri.file(filePath)
            const document = await vscode.workspace.openTextDocument(uri)
            const content = document.getText()
            getLogger().info(`[FileSystemManager] 📸 Captured existing content: ${content.length} chars`)
            return { content, exists: true }
        } catch (error) {
            // File doesn't exist yet
            getLogger().info(`[FileSystemManager] 🆕 File doesn't exist yet: ${filePath}`)
            return { content: '', exists: false }
        }
    }

    /**
     * Prepare file for writing (create directory if needed)
     */
    public async prepareFileForWrite(filePath: string, fileExists: boolean): Promise<void> {
        try {
            if (!fileExists) {
                // Create directory if needed
                const directory = path.dirname(filePath)
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(directory))

                getLogger().info(`[FileSystemManager] 📁 Directory prepared, file will be created by write operation`)
            } else {
                getLogger().info(`[FileSystemManager] 📄 File exists and is accessible: ${filePath}`)
            }
            getLogger().info(`[FileSystemManager] ✅ File prepared: ${filePath}`)
        } catch (error) {
            getLogger().error(`[FileSystemManager] ❌ Failed to prepare file: ${error}`)
            throw error
        }
    }

    /**
     * Read current file content
     */
    public async getCurrentFileContent(filePath: string): Promise<string> {
        try {
            const uri = vscode.Uri.file(filePath)
            const content = await vscode.workspace.fs.readFile(uri)
            return Buffer.from(content).toString('utf8')
        } catch {
            return ''
        }
    }

    /**
     * Clean up old pending writes
     */
    public cleanupOldPendingWrites(pendingWrites: Map<string, PendingFileWrite>): number {
        const now = Date.now()
        const timeout = 5 * 60 * 1000 // 5 minutes

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
        getLogger().info(`[FileSystemManager] 💥 Disposing FileSystemManager`)

        if (this.fileWatcher) {
            this.fileWatcher.dispose()
        }

        // Dispose all event listeners
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
