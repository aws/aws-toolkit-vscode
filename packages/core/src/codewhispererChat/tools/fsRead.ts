/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import fs from '../../shared/fs/fs'
import { Writable } from 'stream'
import { InvokeOutput, OutputKind, sanitizePath, CommandValidation, fsReadToolResponseSize } from './toolShared'
import { isInDirectory } from '../../shared/filesystemUtilities'
import path from 'path'

export interface FsReadParams {
    path: string
    readRange?: number[]
}

export class FsRead {
    private fsPath: string
    private readonly readRange?: number[]
    private readonly logger = getLogger('fsRead')

    constructor(params: FsReadParams) {
        this.fsPath = params.path
        this.readRange = params.readRange
    }

    public async validate(): Promise<void> {
        this.logger.debug(`Validating fsPath: ${this.fsPath}`)
        if (!this.fsPath || this.fsPath.trim().length === 0) {
            throw new Error('Path cannot be empty.')
        }

        const sanitized = sanitizePath(this.fsPath)
        this.fsPath = sanitized

        const fileUri = vscode.Uri.file(this.fsPath)
        let fileExists: boolean
        try {
            fileExists = await fs.existsFile(fileUri)
            if (!fileExists) {
                throw new Error(`Path: "${this.fsPath}" does not exist or cannot be accessed.`)
            }
        } catch (err) {
            throw new Error(`Path: "${this.fsPath}" does not exist or cannot be accessed. (${err})`)
        }

        this.logger.debug(`Validation succeeded for path: ${this.fsPath}`)
    }

    public queueDescription(updates: Writable, requiresAcceptance: boolean): void {
        if (requiresAcceptance) {
            const fileName = path.basename(this.fsPath)
            const fileUri = vscode.Uri.file(this.fsPath)
            updates.write(`Reading file: [${fileName}](${fileUri}), `)

            const [start, end] = this.readRange ?? []

            if (start && end) {
                updates.write(`from line ${start} to ${end}`)
            } else if (start) {
                if (start > 0) {
                    updates.write(`from line ${start} to end of file`)
                } else {
                    updates.write(`${start} line from the end of file to end of file`)
                }
            } else {
                updates.write('all lines')
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

            const fileContents = await this.readFile(fileUri)
            this.logger.info(`Read file: ${this.fsPath}, size: ${fileContents.length}`)
            return this.handleFileRange(fileContents)
        } catch (error: any) {
            this.logger.error(`Failed to read "${this.fsPath}": ${error.message || error}`)
            throw new Error(`Failed to read "${this.fsPath}": ${error.message || error}`)
        }
    }

    private async readFile(fileUri: vscode.Uri): Promise<string> {
        this.logger.info(`Reading file: ${fileUri.fsPath}`)
        return await fs.readFileText(fileUri)
    }

    private handleFileRange(fullText: string): InvokeOutput {
        if (!this.readRange || this.readRange.length === 0) {
            this.logger.info('No range provided. returning entire file.')
            return this.createOutput(fullText)
        }

        const lines = fullText.split('\n')
        const [start, end] = this.parseLineRange(lines.length, this.readRange)
        if (start > end) {
            this.logger.error(`Invalid range: ${this.readRange.join('-')}`)
            return this.createOutput('')
        }

        this.logger.info(`Reading file: ${this.fsPath}, lines ${start + 1}-${end + 1}`)
        const slice = lines.slice(start, end + 1).join('\n')
        return this.createOutput(slice)
    }

    private parseLineRange(lineCount: number, range: number[]): [number, number] {
        const startIdx = range[0]
        let endIdx = range.length >= 2 ? range[1] : undefined

        if (endIdx === undefined) {
            endIdx = -1
        }

        const convert = (i: number): number => {
            return i < 0 ? lineCount + i : i - 1
        }

        const finalStart = Math.max(0, Math.min(lineCount - 1, convert(startIdx)))
        const finalEnd = Math.max(0, Math.min(lineCount - 1, convert(endIdx)))
        return [finalStart, finalEnd]
    }

    private createOutput(content: string): InvokeOutput {
        let truncated = false
        if (content.length > fsReadToolResponseSize) {
            truncated = true
            this.logger.info(
                `The file is too large, truncating output to the first ${fsReadToolResponseSize} characters.`
            )
            content = this.truncateContent(content)
        }
        const outputJson = {
            content: content,
            truncated: truncated,
        }
        return {
            output: {
                kind: OutputKind.Json,
                content: outputJson,
            },
        }
    }

    private truncateContent(content: string): string {
        if (content.length > fsReadToolResponseSize) {
            return content.substring(0, fsReadToolResponseSize - 3) + '...'
        }
        return content
    }
}
