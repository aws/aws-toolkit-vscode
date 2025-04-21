/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { readDirectoryRecursively } from '../../shared/utilities/workspaceUtils'
import fs from '../../shared/fs/fs'
import { Writable } from 'stream'
import path from 'path'
import { InvokeOutput, OutputKind, sanitizePath, CommandValidation } from './toolShared'
import { isInDirectory } from '../../shared/filesystemUtilities'

export interface FileSearchParams {
    path: string
    pattern: string
    maxDepth?: number
    caseSensitive?: boolean
}

export class FileSearch {
    private fsPath: string
    private pattern: RegExp
    private maxDepth?: number
    private readonly logger = getLogger('fileSearch')

    constructor(params: FileSearchParams) {
        this.fsPath = params.path
        // Create RegExp with case sensitivity option
        this.pattern = new RegExp(params.pattern, params.caseSensitive ? '' : 'i')
        this.maxDepth = params.maxDepth
    }

    public async validate(): Promise<void> {
        if (!this.fsPath || this.fsPath.trim().length === 0) {
            throw new Error('Path cannot be empty.')
        }
        if (this.maxDepth !== undefined && this.maxDepth < 0) {
            throw new Error('MaxDepth cannot be negative.')
        }

        const sanitized = sanitizePath(this.fsPath)
        this.fsPath = sanitized

        const pathUri = vscode.Uri.file(this.fsPath)
        let pathExists: boolean
        try {
            pathExists = await fs.existsDir(pathUri)
            if (!pathExists) {
                throw new Error(`Path: "${this.fsPath}" does not exist or cannot be accessed.`)
            }
        } catch (err) {
            throw new Error(`Path: "${this.fsPath}" does not exist or cannot be accessed. (${err})`)
        }
    }

    public queueDescription(updates: Writable): void {
        const fileName = path.basename(this.fsPath)
        if (this.maxDepth === undefined) {
            updates.write(`Searching for files matching pattern: ${this.pattern} in ${fileName} recursively`)
        } else if (this.maxDepth === 0) {
            updates.write(`Searching for files matching pattern: ${this.pattern} in ${fileName}`)
        } else {
            const level = this.maxDepth > 1 ? 'levels' : 'level'
            updates.write(
                `Searching for files matching pattern: ${this.pattern} in ${fileName} limited to ${this.maxDepth} subfolder ${level}`
            )
        }
        updates.end()
    }

    public requiresAcceptance(): CommandValidation {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return { requiresAcceptance: true }
        }
        const isInWorkspace = workspaceFolders.some((folder) => isInDirectory(folder.uri.fsPath, this.fsPath))
        if (!isInWorkspace) {
            return { requiresAcceptance: true }
        }
        return { requiresAcceptance: false }
    }

    public async invoke(updates?: Writable): Promise<InvokeOutput> {
        try {
            const fileUri = vscode.Uri.file(this.fsPath)
            const allFiles = await readDirectoryRecursively(fileUri, this.maxDepth)

            // Filter files by regex pattern
            const matchedFiles = allFiles.filter((filePath) => {
                // Extract just the filename from the path
                const fileName = path.basename(filePath.split(' ').slice(1).join(' '))
                return this.pattern.test(fileName)
            })

            return this.createOutput(matchedFiles.join('\n'))
        } catch (error: any) {
            this.logger.error(`Failed to search files in "${this.fsPath}": ${error.message || error}`)
            throw new Error(`Failed to search files in "${this.fsPath}": ${error.message || error}`)
        }
    }

    private createOutput(content: string): InvokeOutput {
        return {
            output: {
                kind: OutputKind.Text,
                content: content,
            },
        }
    }
}
