/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvokeOutput, OutputKind, sanitizePath } from './toolShared'
import { getLogger } from '../../shared/logger/logger'
import vscode from 'vscode'
import { fs } from '../../shared/fs/fs'
import { Writable } from 'stream'

interface BaseParams {
    path: string
}

export interface CreateParams extends BaseParams {
    command: 'create'
    fileText?: string
    newStr?: string
}

export interface StrReplaceParams extends BaseParams {
    command: 'strReplace'
    oldStr: string
    newStr: string
}

export interface InsertParams extends BaseParams {
    command: 'insert'
    insertLine: number
    newStr: string
}

export interface AppendParams extends BaseParams {
    command: 'append'
    newStr: string
}

export type FsWriteParams = CreateParams | StrReplaceParams | InsertParams | AppendParams

export class FsWrite {
    private readonly logger = getLogger('fsWrite')

    constructor(private readonly params: FsWriteParams) {}

    public async invoke(updates?: Writable): Promise<InvokeOutput> {
        const sanitizedPath = sanitizePath(this.params.path)

        switch (this.params.command) {
            case 'create':
                await this.handleCreate(this.params, sanitizedPath)
                break
            case 'strReplace':
                await this.handleStrReplace(this.params, sanitizedPath)
                break
            case 'insert':
                await this.handleInsert(this.params, sanitizedPath)
                break
            case 'append':
                await this.handleAppend(this.params, sanitizedPath)
                break
        }

        return {
            output: {
                kind: OutputKind.Text,
                content: '',
            },
        }
    }

    private showStrReplacePreview(oldStr: string, newStr: string): string {
        // Split both strings into arrays of lines
        const oldStrLines = oldStr.split('\n')
        const newStrLines = newStr.split('\n')
        let result = ''

        // If strings are identical, return empty string
        if (oldStr === newStr) {
            return result
        }

        let oldLineIndex = 0
        let newLineIndex = 0
        // Loop through both arrays until we've processed all lines
        while (oldLineIndex < oldStrLines.length || newLineIndex < newStrLines.length) {
            if (
                oldLineIndex < oldStrLines.length &&
                newLineIndex < newStrLines.length &&
                oldStrLines[oldLineIndex] === newStrLines[newLineIndex]
            ) {
                // Line is unchanged - prefix with space
                result += ` ${oldStrLines[oldLineIndex]}\n`
                oldLineIndex++
                newLineIndex++
            } else {
                // Line is different
                if (oldLineIndex < oldStrLines.length) {
                    // Remove line - prefix with minus
                    result += `- ${oldStrLines[oldLineIndex]}\n`
                    oldLineIndex++
                }
                if (newLineIndex < newStrLines.length) {
                    // Add line - prefix with plus
                    result += `+ ${newStrLines[newLineIndex]}\n`
                    newLineIndex++
                }
            }
        }

        return result
    }

    private async showInsertPreview(path: string, insertLine: number, newStr: string): Promise<string> {
        const fileContent = await fs.readFileText(path)
        const lines = fileContent.split('\n')
        const startLine = Math.max(0, insertLine - 2)
        const endLine = Math.min(lines.length, insertLine + 3)

        const contextLines: string[] = []

        // Add lines before insertion point
        for (let index = startLine; index < insertLine; index++) {
            contextLines.push(` ${lines[index]}`)
        }

        // Add the new line with a '+' prefix
        contextLines.push(`+ ${newStr}`)

        // Add lines after insertion point
        for (let index = insertLine; index < endLine; index++) {
            contextLines.push(` ${lines[index]}`)
        }

        return contextLines.join('\n')
    }

    private async showAppendPreview(sanitizedPath: string, newStr: string) {
        const fileContent = await fs.readFileText(sanitizedPath)
        const needsNewline = fileContent.length !== 0 && !fileContent.endsWith('\n')

        let contentToAppend = newStr
        if (needsNewline) {
            contentToAppend = '\n' + contentToAppend
        }

        // Get the last 3 lines from existing content for better UX
        const lines = fileContent.split('\n')
        const linesForContext = lines.slice(-3)

        return `${linesForContext.join('\n')}\n+ ${contentToAppend.trim()}`
    }

    public async queueDescription(updates: Writable): Promise<void> {
        switch (this.params.command) {
            case 'create':
                updates.write(`\`\`\`diff-typescript
${'+' + this.params.fileText?.replace(/\n/g, '\n+')}
                    `)
                break
            case 'strReplace':
                updates.write(`\`\`\`diff-typescript
${this.showStrReplacePreview(this.params.oldStr, this.params.newStr)}
\`\`\`
`)
                break
            case 'insert':
                updates.write(`\`\`\`diff-typescript
${await this.showInsertPreview(this.params.path, this.params.insertLine, this.params.newStr)}
\`\`\``)
                break
            case 'append':
                updates.write(`\`\`\`diff-typescript
${await this.showAppendPreview(this.params.path, this.params.newStr)}
\`\`\``)
                break
        }
        updates.end()
    }

    public async validate(): Promise<void> {
        switch (this.params.command) {
            case 'create':
                if (!this.params.path) {
                    throw new Error('Path must not be empty')
                }
                break
            case 'strReplace':
            case 'insert': {
                const fileExists = await fs.existsFile(this.params.path)
                if (!fileExists) {
                    throw new Error('The provided path must exist in order to replace or insert contents into it')
                }
                break
            }
            case 'append':
                if (!this.params.path) {
                    throw new Error('Path must not be empty')
                }
                if (!this.params.newStr) {
                    throw new Error('Content to append must not be empty')
                }
                break
        }
    }

    private async handleCreate(params: CreateParams, sanitizedPath: string): Promise<void> {
        const content = this.getCreateCommandText(params)

        const fileExists = await fs.existsFile(sanitizedPath)
        const actionType = fileExists ? 'Replacing' : 'Creating'

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `${actionType}: ${sanitizedPath}`,
                cancellable: false,
            },
            async () => {
                await fs.writeFile(sanitizedPath, content)
            }
        )
    }

    private async handleStrReplace(params: StrReplaceParams, sanitizedPath: string): Promise<void> {
        const fileContent = await fs.readFileText(sanitizedPath)

        const matches = [...fileContent.matchAll(new RegExp(this.escapeRegExp(params.oldStr), 'g'))]

        if (matches.length === 0) {
            throw new Error(`No occurrences of "${params.oldStr}" were found`)
        }
        if (matches.length > 1) {
            throw new Error(`${matches.length} occurrences of oldStr were found when only 1 is expected`)
        }

        const newContent = fileContent.replace(params.oldStr, params.newStr)
        await fs.writeFile(sanitizedPath, newContent)
    }

    private async handleInsert(params: InsertParams, sanitizedPath: string): Promise<void> {
        const fileContent = await fs.readFileText(sanitizedPath)
        const lines = fileContent.split('\n')

        const numLines = lines.length
        const insertLine = Math.max(0, Math.min(params.insertLine, numLines))

        let newContent: string
        if (insertLine === 0) {
            newContent = params.newStr + '\n' + fileContent
        } else {
            newContent = [...lines.slice(0, insertLine), params.newStr, ...lines.slice(insertLine)].join('\n')
        }

        await fs.writeFile(sanitizedPath, newContent)
    }

    private async handleAppend(params: AppendParams, sanitizedPath: string): Promise<void> {
        const fileContent = await fs.readFileText(sanitizedPath)
        const needsNewline = fileContent.length !== 0 && !fileContent.endsWith('\n')

        let contentToAppend = params.newStr
        if (needsNewline) {
            contentToAppend = '\n' + contentToAppend
        }

        const newContent = fileContent + contentToAppend
        await fs.writeFile(sanitizedPath, newContent)
    }

    private getCreateCommandText(params: CreateParams): string {
        if (params.fileText) {
            return params.fileText
        }
        if (params.newStr) {
            this.logger.warn('Required field `fileText` is missing, use the provided `newStr` instead')
            return params.newStr
        }
        this.logger.warn('No content provided for the create command')
        return ''
    }

    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
}
