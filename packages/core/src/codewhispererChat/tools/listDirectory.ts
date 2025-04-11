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

export interface ListDirectoryParams {
    path: string
    maxDepth?: number
}

export class ListDirectory {
    private fsPath: string
    private maxDepth?: number
    private readonly logger = getLogger('listDirectory')

    constructor(params: ListDirectoryParams) {
        this.fsPath = params.path
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

    public queueDescription(updates: Writable, requiresAcceptance: boolean): void {
        if (requiresAcceptance) {
            const fileName = path.basename(this.fsPath)
            if (this.maxDepth === undefined) {
                updates.write(`Analyzing directories recursively: ${fileName}`)
            } else if (this.maxDepth === 0) {
                updates.write(`Analyzing directory: ${fileName}`)
            } else {
                const level = this.maxDepth > 1 ? 'levels' : 'level'
                updates.write(`Analyzing directory: ${fileName} limited to ${this.maxDepth} subfolder ${level}`)
            }
        } else {
            updates.write('')
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
            const listing = await readDirectoryRecursively(fileUri, this.maxDepth)
            return this.createOutput(listing.join('\n'))
        } catch (error: any) {
            this.logger.error(`Failed to list directory "${this.fsPath}": ${error.message || error}`)
            throw new Error(`Failed to list directory "${this.fsPath}": ${error.message || error}`)
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
