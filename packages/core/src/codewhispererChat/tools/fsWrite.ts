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

    private generateSmartDiff(oldStr: string, newStr: string): string {
        // Split both strings into arrays of lines
        const oldLines = oldStr.split('\n')
        const newLines = newStr.split('\n')
        let result = ''

        // If strings are identical, return empty string
        if (oldStr === newStr) {
            return result
        }

        let i = 0 // Index for oldLines
        let j = 0 // Index for newLines

        // Loop through both arrays until we've processed all lines
        while (i < oldLines.length || j < newLines.length) {
            if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
                // Line is unchanged - prefix with space
                result += ` ${oldLines[i]}\n`
                i++
                j++
            } else {
                // Line is different
                if (i < oldLines.length) {
                    // Remove line - prefix with minus
                    result += `-${oldLines[i]}\n`
                    i++
                }
                if (j < newLines.length) {
                    // Add line - prefix with plus
                    result += `+${newLines[j]}\n`
                    j++
                }
            }
        }

        return result
    }

    private async getInsertContext(path: string, insertLine: number, newStr: string): Promise<string> {
        const fileContent = await fs.readFileText(path)
        const lines = fileContent.split('\n')
        const startLine = Math.max(0, insertLine - 2)
        const endLine = Math.min(lines.length, insertLine + 3)

        const contextLines: string[] = []

        // Add lines before insertion point
        for (let i = startLine; i < insertLine; i++) {
            contextLines.push(` ${lines[i]}`)
        }

        // Add the new line with a '+' prefix
        contextLines.push(`+${newStr}`)

        // Add lines after insertion point
        for (let i = insertLine; i < endLine; i++) {
            contextLines.push(` ${lines[i]}`)
        }

        return contextLines.join('\n')
    }

    private async handleAppendContent(sanitizedPath: string, newStr: string) {
        const fileContent = await fs.readFileText(sanitizedPath)
        const needsNewline = fileContent.length !== 0 && !fileContent.endsWith('\n')

        let contentToAppend = newStr
        if (needsNewline) {
            contentToAppend = '\n' + contentToAppend
        }

        // Get the last 3 lines from existing content
        const lines = fileContent.split('\n')
        const last3Lines = lines.slice(-3)

        // Format the output with the last 3 lines and new content
        // const formattedOutput = [
        //     ...last3Lines,
        //     `+ ${contentToAppend.trim()}`, // Add '+' prefix to new content
        // ].join('\n')

        return `${last3Lines.join('\n')}\n+ ${contentToAppend.trim()}` // [last3Lines, contentToAppend.trim()] // `${last3Lines.join('\n')}\n+ ${contentToAppend.trim()}`
    }

    public async queueDescription(updates: Writable): Promise<void> {
        // const fileName = path.basename(this.params.path)
        switch (this.params.command) {
            case 'create':
                updates.write(`\`\`\`diff-typescript
${'+' + this.params.fileText?.replace(/\n/g, '\n+')}
                    `)
                break
            case 'strReplace':
                updates.write(`\`\`\`diff-typescript
${this.generateSmartDiff(this.params.oldStr, this.params.newStr)}
\`\`\`
`)
                break
            case 'insert':
                updates.write(`\`\`\`diff-typescript
${await this.getInsertContext(this.params.path, this.params.insertLine, this.params.newStr)}
\`\`\``)
                break
            case 'append':
                updates.write(`\`\`\`diff-typescript
${await this.handleAppendContent(this.params.path, this.params.newStr)}
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

    private async getLineToInsert(
        sanitizedPath: string,
        insertLine: number,
        newStr: string
    ): Promise<[number, string]> {
        const fileContent = await fs.readFileText(sanitizedPath)
        const lines = fileContent.split('\n')

        const numLines = lines.length
        const insertLineInFile = Math.max(0, Math.min(insertLine, numLines))

        let newContent: string
        if (insertLineInFile === 0) {
            newContent = newStr + '\n' + fileContent
        } else {
            newContent = [...lines.slice(0, insertLineInFile), newStr, ...lines.slice(insertLineInFile)].join('\n')
        }

        return [insertLineInFile, newContent]
    }

    private async handleInsert(params: InsertParams, sanitizedPath: string): Promise<void> {
        const [, newContent] = await this.getLineToInsert(sanitizedPath, params.insertLine, params.newStr)
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
