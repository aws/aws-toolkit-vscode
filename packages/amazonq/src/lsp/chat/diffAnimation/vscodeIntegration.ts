/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from 'aws-core-vscode/shared'

export class VSCodeIntegration {
    constructor() {
        getLogger().info('[VSCodeIntegration] 🚀 Initialized VS Code integration')
    }

    /**
     * Show VS Code's built-in diff view (for file tab clicks)
     */
    public async showVSCodeDiff(filePath: string, originalContent: string, newContent: string): Promise<void> {
        const fileName = path.basename(filePath)

        // For new files, use empty content if original is empty
        const leftContent = originalContent || ''

        // Create temporary file for original content with a unique scheme
        const leftUri = vscode.Uri.from({
            scheme: 'amazon-q-diff-temp',
            path: `${fileName}`,
            query: `original=${Date.now()}`, // Add timestamp to make it unique
        })

        // Register a one-time content provider for this URI
        const disposable = vscode.workspace.registerTextDocumentContentProvider('amazon-q-diff-temp', {
            provideTextDocumentContent: (uri) => {
                if (uri.toString() === leftUri.toString()) {
                    return leftContent
                }
                return ''
            },
        })

        try {
            // Open diff view
            const fileUri = vscode.Uri.file(filePath)
            await vscode.commands.executeCommand(
                'vscode.diff',
                leftUri,
                fileUri,
                `${fileName}: ${leftContent ? 'Original' : 'New File'} ↔ Current`
            )
        } finally {
            // Clean up the content provider after a delay
            setTimeout(() => disposable.dispose(), 1000)
        }
    }

    /**
     * Open a file in VS Code editor
     */
    public async openFileInEditor(filePath: string, options?: vscode.TextDocumentShowOptions): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
            await vscode.window.showTextDocument(doc, {
                preview: false,
                viewColumn: vscode.ViewColumn.One,
                ...options,
            })
            getLogger().info(`[VSCodeIntegration] Opened file in editor: ${filePath}`)
        } catch (error) {
            getLogger().error(`[VSCodeIntegration] Failed to open file in editor: ${error}`)
            throw error
        }
    }

    /**
     * Show status bar message
     */
    public showStatusMessage(message: string, timeout?: number): vscode.Disposable {
        if (timeout !== undefined) {
            return vscode.window.setStatusBarMessage(message, timeout)
        }
        return vscode.window.setStatusBarMessage(message)
    }

    /**
     * Show information message
     */
    public async showInfoMessage(message: string, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showInformationMessage(message, ...items)
    }

    /**
     * Show warning message
     */
    public async showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showWarningMessage(message, ...items)
    }

    /**
     * Show error message
     */
    public async showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showErrorMessage(message, ...items)
    }

    /**
     * Get workspace folders
     */
    public getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
        return vscode.workspace.workspaceFolders
    }

    /**
     * Get active text editor
     */
    public getActiveTextEditor(): vscode.TextEditor | undefined {
        return vscode.window.activeTextEditor
    }

    /**
     * Apply workspace edit
     */
    public async applyWorkspaceEdit(edit: vscode.WorkspaceEdit): Promise<boolean> {
        return vscode.workspace.applyEdit(edit)
    }

    /**
     * Create workspace edit for file content replacement
     */
    public createContentReplacementEdit(filePath: string, newContent: string): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit()
        const uri = vscode.Uri.file(filePath)

        // We'll need to get the document to determine the full range
        // For now, create a simple edit that replaces everything
        edit.createFile(uri, { ignoreIfExists: true })
        edit.insert(uri, new vscode.Position(0, 0), newContent)

        return edit
    }

    /**
     * Execute VS Code command
     */
    public async executeCommand<T = any>(command: string, ...args: any[]): Promise<T> {
        return vscode.commands.executeCommand<T>(command, ...args)
    }

    /**
     * Register command
     */
    public registerCommand(command: string, callback: (...args: any[]) => any): vscode.Disposable {
        return vscode.commands.registerCommand(command, callback)
    }

    /**
     * Get configuration value
     */
    public getConfiguration<T>(section: string, defaultValue?: T): T {
        const config = vscode.workspace.getConfiguration()
        return config.get<T>(section, defaultValue as T)
    }

    /**
     * Update configuration value
     */
    public async updateConfiguration(section: string, value: any, target?: vscode.ConfigurationTarget): Promise<void> {
        const config = vscode.workspace.getConfiguration()
        await config.update(section, value, target)
    }

    /**
     * Show quick pick
     */
    public async showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions
    ): Promise<T | undefined> {
        return vscode.window.showQuickPick(items, options)
    }

    /**
     * Show input box
     */
    public async showInputBox(options?: vscode.InputBoxOptions): Promise<string | undefined> {
        return vscode.window.showInputBox(options)
    }

    /**
     * Create output channel
     */
    public createOutputChannel(name: string): vscode.OutputChannel {
        return vscode.window.createOutputChannel(name)
    }

    /**
     * Get file system stats
     */
    public async getFileStat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return vscode.workspace.fs.stat(uri)
    }

    /**
     * Read file content
     */
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return vscode.workspace.fs.readFile(uri)
    }

    /**
     * Write file content
     */
    public async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        return vscode.workspace.fs.writeFile(uri, content)
    }

    /**
     * Create directory
     */
    public async createDirectory(uri: vscode.Uri): Promise<void> {
        return vscode.workspace.fs.createDirectory(uri)
    }

    /**
     * Check if file exists
     */
    public async fileExists(filePath: string): Promise<boolean> {
        try {
            await this.getFileStat(vscode.Uri.file(filePath))
            return true
        } catch {
            return false
        }
    }

    /**
     * Get relative path from workspace
     */
    public getRelativePath(filePath: string): string {
        const workspaceFolders = this.getWorkspaceFolders()
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return filePath
        }

        for (const folder of workspaceFolders) {
            if (filePath.startsWith(folder.uri.fsPath)) {
                return path.relative(folder.uri.fsPath, filePath)
            }
        }

        return filePath
    }

    /**
     * Focus on editor
     */
    public async focusEditor(): Promise<void> {
        await this.executeCommand('workbench.action.focusActiveEditorGroup')
    }

    /**
     * Close all editors
     */
    public async closeAllEditors(): Promise<void> {
        await this.executeCommand('workbench.action.closeAllEditors')
    }

    /**
     * Get theme information
     */
    public getThemeInfo(): {
        kind: vscode.ColorThemeKind
        isDark: boolean
        isLight: boolean
        isHighContrast: boolean
    } {
        const kind = vscode.window.activeColorTheme.kind
        return {
            kind,
            isDark: kind === vscode.ColorThemeKind.Dark,
            isLight: kind === vscode.ColorThemeKind.Light,
            isHighContrast: kind === vscode.ColorThemeKind.HighContrast,
        }
    }
}
