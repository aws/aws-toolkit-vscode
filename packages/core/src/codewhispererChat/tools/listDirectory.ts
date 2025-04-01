/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { readDirectoryRecursively } from '../../shared/utilities/workspaceUtils'
import fs from '../../shared/fs/fs'
import { InvokeOutput, OutputKind, sanitizePath } from './toolShared'
import { Writable } from 'stream'
import path from 'path'

export interface ListDirectoryParams {
    path: string
}

export class ListDirectory {
    private fsPath: string
    private readonly logger = getLogger('listDirectory')

    constructor(params: ListDirectoryParams) {
        this.fsPath = params.path
    }

    public async validate(): Promise<void> {
        if (!this.fsPath || this.fsPath.trim().length === 0) {
            throw new Error('Path cannot be empty.')
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
        updates.write(`Listing directory on filePath: ${fileName}`)
        updates.end()
    }

    public async invoke(updates?: Writable): Promise<InvokeOutput> {
        try {
            const fileUri = vscode.Uri.file(this.fsPath)
            const listing = await readDirectoryRecursively(fileUri, 0)
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
