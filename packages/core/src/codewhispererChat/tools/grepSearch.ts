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
import { rgPath } from '@vscode/ripgrep'
import path from 'path'

export interface GrepSearchParams {
    path?: string
    query: string
    caseSensitive?: boolean
    excludePattern?: string
    includePattern?: string
    explanation?: string
}

/**
 * Represents the structured output from ripgrep search results
 */
export interface SanitizedRipgrepOutput {
    /** Total number of matches across all files */
    totalMatchCount: number

    /** Array of file match details */
    fileMatches: Array<{
        /** Full path to the file */
        filePath: string

        /** Base name of the file */
        fileName: string

        /** Number of matches in this file */
        matchCount: number

        /** Record of line numbers to matched content */
        matches: Record<string, string>
    }>
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
        updates.write('')
        updates.end()
    }

    public requiresAcceptance(): { requiresAcceptance: boolean } {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return { requiresAcceptance: true }
        }

        // Check if the search path is within the workspace
        const isInWorkspace = workspaceFolders.some((folder) => this.path.startsWith(folder.uri.fsPath))
        if (!isInWorkspace) {
            return { requiresAcceptance: true }
        }

        return { requiresAcceptance: false }
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

    private async executeRipgrep(updates?: Writable): Promise<SanitizedRipgrepOutput> {
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

            // Limit results to prevent overwhelming output
            args.push('--max-count', '50')

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
                    // For exit codes 0 and 1, don't reject
                    return false as unknown as Error
                },
            }

            try {
                const rg = new ChildProcess(rgPath, args, options)
                const result = await rg.run()
                this.logger.info(`Executing ripgrep with exitCode: ${result.exitCode}`)

                // Process the output to format with file URLs and content previews
                const sanitizedOutput = this.processRipgrepOutput(result.stdout)

                // If updates is provided, write the processed output
                if (updates) {
                    if (sanitizedOutput.totalMatchCount > 0) {
                        updates.write(`Found total matches: "${sanitizedOutput.totalMatchCount}"  in "${this.path}\n`)
                        // Ensure matches is properly serialized as a plain object
                        const serializedOutput = {
                            ...sanitizedOutput,
                            fileMatches: sanitizedOutput.fileMatches.map((file) => ({
                                ...file,
                                // Ensure matches is a plain object for serialization
                                matches: { ...file.matches },
                            })),
                        }
                        updates.write(JSON.stringify(serializedOutput, undefined, 2))
                    } else {
                        updates.write('No matches found.')
                    }
                }

                resolve(sanitizedOutput)

                // // If updates is provided, write the processed output
                // if (updates) {
                //     if (totalMatchCount > 0) {
                //         updates.write(sanitizedOutput)
                //     } else {
                //         updates.write('No matches found.')
                //     }
                // }

                // this.logger.info(`Processed ripgrep result: ${totalMatchCount} matches found`)
                // resolve(sanitizedOutput || 'No matches found.')
            } catch (err) {
                if (updates) {
                    updates.write(`Error executing search: ${err}`)
                }
                reject(err)
            }
        })
    }

    /**
     * Process ripgrep output to:
     * 1. Group results by file
     * 2. Return structured match details for each file
     */
    private processRipgrepOutput(output: string): SanitizedRipgrepOutput {
        if (!output || output.trim() === '') {
            return {
                totalMatchCount: 0,
                fileMatches: [],
            }
        }
        const lines = output.split('\n')
        // Group by file path
        const fileGroups: Record<string, { lineNumbers: string[]; content: string[] }> = {}
        let totalMatchCount = 0
        for (const line of lines) {
            if (!line || line.trim() === '') {
                continue
            }
            // Extract file path, line number, and content
            const parts = line.split(':')
            if (parts.length < 3) {
                continue
            }
            const filePath = parts[0]
            const lineNumber = parts[1]
            const content = parts.slice(2).join(':').trim()
            if (!fileGroups[filePath]) {
                fileGroups[filePath] = { lineNumbers: [], content: [] }
            }
            fileGroups[filePath].lineNumbers.push(lineNumber)
            fileGroups[filePath].content.push(content)
            totalMatchCount++
        }
        // Sort files by match count (most matches first)
        const sortedFiles = Object.entries(fileGroups).sort((a, b) => b[1].lineNumbers.length - a[1].lineNumbers.length)
        // Create structured file matches
        const fileMatches = sortedFiles.map(([filePath, data]) => {
            const fileName = path.basename(filePath)
            const matchCount = data.lineNumbers.length
            // Create a regular object instead of a Map for better JSON serialization
            const matches: Record<string, string> = {}
            for (const [idx, lineNum] of data.lineNumbers.entries()) {
                matches[lineNum] = data.content[idx]
            }

            return {
                filePath,
                fileName,
                matchCount,
                matches,
            }
        })

        return {
            totalMatchCount,
            fileMatches,
        }
    }

    private createOutput(content: SanitizedRipgrepOutput): InvokeOutput {
        return {
            output: {
                kind: OutputKind.Json,
                content: content,
            },
        }
    }
}
