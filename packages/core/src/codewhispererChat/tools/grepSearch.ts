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
    private path: string
    private query: string
    private caseSensitive: boolean
    private excludePattern?: string
    private includePattern?: string
    private readonly logger = getLogger('grepSearch')

    constructor(params: GrepSearchParams) {
        this.path = this.getSearchDirectory(params.path)
        this.query = params.query
        this.caseSensitive = params.caseSensitive ?? false
        this.excludePattern = params.excludePattern
        this.includePattern = params.includePattern
    }

    public async validate(): Promise<void> {
        if (!this.query || this.query.trim().length === 0) {
            throw new Error('Grep search query cannot be empty.')
        }

        if (this.path.trim().length === 0) {
            throw new Error('Path cannot be empty and no workspace folder is available.')
        }

        const sanitized = sanitizePath(this.path)
        this.path = sanitized

        const pathUri = vscode.Uri.file(this.path)
        let pathExists: boolean
        try {
            pathExists = await fs.existsDir(pathUri)
            if (!pathExists) {
                throw new Error(`Path: "${this.path}" does not exist or cannot be accessed.`)
            }
        } catch (err) {
            throw new Error(`Path: "${this.path}" does not exist or cannot be accessed. (${err})`)
        }
    }

    public queueDescription(updates: Writable): void {
        updates.write(`Grepping for "${this.query}" in directory: ${this.path}`)
        updates.end()
    }

    public async invoke(updates?: Writable): Promise<InvokeOutput> {
        try {
            const results = await this.executeRipgrep(updates)
            return this.createOutput(results)
        } catch (error: any) {
            this.logger.error(`Failed to search in "${this.path}": ${error.message || error}`)
            throw new Error(`Failed to search in "${this.path}": ${error.message || error}`)
        }
    }

    private getSearchDirectory(path?: string): string {
        let searchLocation = ''
        if (path && path.trim().length !== 0) {
            searchLocation = path
        } else {
            // Handle optional path parameter
            // Use current workspace folder as default if path is not provided
            const workspaceFolders = vscode.workspace.workspaceFolders
            this.logger.info(`Using default workspace folder: ${workspaceFolders?.length}`)
            if (workspaceFolders && workspaceFolders.length !== 0) {
                searchLocation = workspaceFolders[0].uri.fsPath
                this.logger.debug(`Using default workspace folder: ${searchLocation}`)
            }
        }
        return searchLocation
    }

    private async executeRipgrep(updates?: Writable): Promise<string> {
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
            args.push(this.query, this.path)

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
                const { sanitizedOutput, totalMatchCount } = this.processRipgrepOutput(result.stdout)

                // If updates is provided, write the processed output
                if (updates) {
                    updates.write(`\n\n(${totalMatchCount} matches found):\n\n`)
                    updates.write(sanitizedOutput)
                }

                this.logger.info(`Processed ripgrep result: ${totalMatchCount} matches found`)
                resolve(sanitizedOutput)
            } catch (err) {
                reject(err)
            }
        })
    }

    /**
     * Process ripgrep output to:
     * 1. Group results by file
     * 2. Format as collapsible sections
     * 3. Add file URLs for clickable links
     * @returns An object containing the processed output and total match count
     */
    private processRipgrepOutput(output: string): { sanitizedOutput: string; totalMatchCount: number } {
        if (!output || output.trim() === '') {
            return { sanitizedOutput: 'No matches found.', totalMatchCount: 0 }
        }

        const lines = output.split('\n')

        // Group by file path
        const fileGroups: Record<string, string[]> = {}
        let totalMatchCount = 0

        for (const line of lines) {
            if (!line || line.trim() === '') {
                continue
            }

            // Extract file path and line number
            const parts = line.split(':')
            if (parts.length < 2) {
                continue
            }

            const filePath = parts[0]
            const lineNumber = parts[1]
            // Don't include match content

            if (!fileGroups[filePath]) {
                fileGroups[filePath] = []
            }

            // Create a clickable link with line number using VS Code's Uri.with() method
            const uri = vscode.Uri.file(filePath)
            // Use the with() method to add the line number as a fragment
            const uriWithLine = uri.with({ fragment: `L${lineNumber}` })
            fileGroups[filePath].push(`- [Line ${lineNumber}](${uriWithLine.toString(true)})`)
            totalMatchCount++
        }

        // Sort files by match count (most matches first)
        const sortedFiles = Object.entries(fileGroups).sort((a, b) => b[1].length - a[1].length)

        // Format as collapsible sections
        const sanitizedOutput = sortedFiles
            .map(([filePath, matches]) => {
                const fileName = path.basename(filePath)
                const matchCount = matches.length

                return `<details>
    <summary><strong>${fileName} - match count: (${matchCount})</strong></summary>

${matches.join('\n')}
</details>`
            })
            .join('\n\n')

        return { sanitizedOutput, totalMatchCount }
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
