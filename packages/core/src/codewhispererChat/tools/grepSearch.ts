/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { sanitizePath, InvokeOutput, OutputKind } from './toolShared'
import fs from '../../shared/fs/fs'
import { Writable } from 'stream'
import { ChildProcess, ChildProcessOptions } from '../../shared/utilities/processUtils'
import { rgPath } from 'vscode-ripgrep'
import path from 'path'

export interface GrepSearchParams {
    path?: string
    query: string
    caseSensitive?: boolean
    excludePattern?: string
    includePattern?: string
    explanation?: string
}

export class GrepSearch {
    private fsPath: string | undefined
    private query: string
    private caseSensitive: boolean
    private excludePattern?: string
    private includePattern?: string
    private readonly logger = getLogger('grepSearch')

    constructor(params: GrepSearchParams) {
        this.fsPath = params.path
        this.query = params.query
        this.caseSensitive = params.caseSensitive ?? false
        this.excludePattern = params.excludePattern
        this.includePattern = params.includePattern
    }

    public async validate(): Promise<void> {
        if (!this.query || this.query.trim().length === 0) {
            throw new Error('Grep search query cannot be empty.')
        }

        // Handle optional path parameter
        if (!this.fsPath || this.fsPath.trim().length === 0) {
            // Use current workspace folder as default if path is not provided
            const workspaceFolders = vscode.workspace.workspaceFolders
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('Path cannot be empty and no workspace folder is available.')
            }
            this.fsPath = workspaceFolders[0].uri.fsPath
            this.logger.debug(`Using default workspace folder: ${this.fsPath}`)
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
        const searchDirectory = this.getSearchDirectory(this.fsPath)
        updates.write(`Grepping for "${this.query}" in directory: ${searchDirectory}`)
        updates.end()
    }

    public async invoke(updates?: Writable): Promise<InvokeOutput> {
        const searchDirectory = this.getSearchDirectory(this.fsPath)
        try {
            const results = await this.executeRipgrep(updates)
            return this.createOutput(results)
        } catch (error: any) {
            this.logger.error(`Failed to search in "${searchDirectory}": ${error.message || error}`)
            throw new Error(`Failed to search in "${searchDirectory}": ${error.message || error}`)
        }
    }

    private getSearchDirectory(fsPath?: string): string {
        const workspaceFolders = vscode.workspace.workspaceFolders
        const searchLocation = fsPath
            ? fsPath
            : !workspaceFolders || workspaceFolders.length === 0
              ? ''
              : workspaceFolders[0].uri.fsPath
        return searchLocation
    }

    private async executeRipgrep(updates?: Writable): Promise<string> {
        const searchDirectory = this.getSearchDirectory(this.fsPath)
        return new Promise(async (resolve, reject) => {
            const args: string[] = []

            // Add search options
            if (!this.caseSensitive) {
                args.push('-i') // Case insensitive search
            }
            args.push('--line-number') // Show line numbers

            // No heading (don't group matches by file)
            args.push('--no-heading')

            // Don't use color in output
            args.push('--color', 'never')

            // Add include/exclude patterns
            if (this.includePattern) {
                // Support multiple include patterns
                const patterns = this.includePattern.split(',')
                for (const pattern of patterns) {
                    args.push('--glob', pattern.trim())
                }
            }

            if (this.excludePattern) {
                // Support multiple exclude patterns
                const patterns = this.excludePattern.split(',')
                for (const pattern of patterns) {
                    args.push('--glob', `!${pattern.trim()}`)
                }
            }

            // Add search pattern and path
            args.push(this.query, searchDirectory)

            this.logger.debug(`Executing ripgrep with args: ${args.join(' ')}`)

            const options: ChildProcessOptions = {
                collect: true,
                logging: 'yes',
                rejectOnErrorCode: (code) => {
                    if (code !== 0 && code !== 1) {
                        this.logger.error(`Ripgrep process exited with code ${code}`)
                        return new Error(`Ripgrep process exited with code ${code}`)
                    }
                    return new Error()
                },
            }

            try {
                const rg = new ChildProcess(rgPath, args, options)
                const result = await rg.run()
                this.logger.info(`Executing ripgrep with exitCode: ${result.exitCode}`)
                // Process the output to format with file URLs and remove matched content
                const processedOutput = this.processRipgrepOutput(result.stdout)

                // If updates is provided, write the processed output
                if (updates) {
                    updates.write('\n\nGreped Results:\n\n')
                    updates.write(processedOutput)
                }

                this.logger.info(`Processed ripgrep result: ${processedOutput}`)
                resolve(processedOutput)
            } catch (err) {
                reject(err)
            }
        })
    }

    /**
     * Process ripgrep output to:
     * 1. Remove matched content (keep only file:line)
     * 2. Add file URLs for clickable links
     */
    private processRipgrepOutput(output: string): string {
        if (!output || output.trim() === '') {
            return 'No matches found.'
        }

        const lines = output.split('\n')
        const processedLines = lines
            .map((line) => {
                if (!line || line.trim() === '') {
                    return ''
                }

                // Extract file path and line number
                const parts = line.split(':')
                if (parts.length < 2) {
                    return line
                }

                const filePath = parts[0]
                const lineNumber = parts[1]

                const fileName = path.basename(filePath)
                const fileUri = vscode.Uri.file(filePath)

                // Format as a markdown link
                return `[${fileName}:${lineNumber}](${fileUri}:${lineNumber})`
            })
            .filter(Boolean)

        return processedLines.join('\n')
    }

    private createOutput(content: string): InvokeOutput {
        return {
            output: {
                kind: OutputKind.Text,
                content: content || 'No matches found.',
            },
        }
    }
}
