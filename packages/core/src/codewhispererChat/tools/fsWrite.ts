/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvokeOutput, OutputKind, sanitizePath } from './toolShared'
import { getLogger } from '../../shared/logger/logger'
import vscode from 'vscode'
import { fs } from '../../shared/fs/fs'
import { Writable } from 'stream'
import { Change, diffLines } from 'diff'
import { getDiffMarkdown } from '../../shared/utilities/diffUtils'
import { getLanguageForFilePath } from '../../shared/utilities/textDocumentUtilities'

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

    public async queueDescription(updates: Writable): Promise<void> {
        const sanitizedPath = sanitizePath(this.params.path)
        const changes = await this.getDiffChanges()
        const language = await getLanguageForFilePath(sanitizedPath)

        const diff = getDiffMarkdown(changes, language)
        updates.write(diff)
        updates.end()
    }

    public async getDiffChanges(): Promise<Change[]> {
        const sanitizedPath = sanitizePath(this.params.path)
        let newContent
        let oldContent
        try {
            oldContent = await fs.readFileText(sanitizedPath)
        } catch (err) {
            oldContent = ''
        }
        switch (this.params.command) {
            case 'create':
                newContent = this.getCreateCommandText(this.params)
                break
            case 'strReplace':
                newContent = await this.getStrReplaceContent(this.params, sanitizedPath)
                break
            case 'insert':
                newContent = await this.getInsertContent(this.params, sanitizedPath)
                break
            case 'append':
                newContent = await this.getAppendContent(this.params, sanitizedPath)
                break
        }
        return diffLines(oldContent, newContent)
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
        const newContent = await this.getStrReplaceContent(params, sanitizedPath)
        await fs.writeFile(sanitizedPath, newContent)
    }

    private async getStrReplaceContent(params: StrReplaceParams, sanitizedPath: string): Promise<string> {
        const fileContent = await fs.readFileText(sanitizedPath)

        const matches = [...fileContent.matchAll(new RegExp(this.escapeRegExp(params.oldStr), 'g'))]

        if (matches.length === 0) {
            throw new Error(`No occurrences of "${params.oldStr}" were found`)
        }
        if (matches.length > 1) {
            throw new Error(`${matches.length} occurrences of oldStr were found when only 1 is expected`)
        }

        return fileContent.replace(params.oldStr, params.newStr)
    }

    private async handleInsert(params: InsertParams, sanitizedPath: string): Promise<void> {
        const newContent = await this.getInsertContent(params, sanitizedPath)
        await fs.writeFile(sanitizedPath, newContent)
    }

    private async getInsertContent(params: InsertParams, sanitizedPath: string): Promise<string> {
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
        return newContent
    }

    private async handleAppend(params: AppendParams, sanitizedPath: string): Promise<void> {
        const newContent = await this.getAppendContent(params, sanitizedPath)
        await fs.writeFile(sanitizedPath, newContent)
    }

    private async getAppendContent(params: AppendParams, sanitizedPath: string): Promise<string> {
        const fileContent = await fs.readFileText(sanitizedPath)
        const needsNewline = fileContent.length !== 0 && !fileContent.endsWith('\n')

        let contentToAppend = params.newStr
        if (needsNewline) {
            contentToAppend = '\n' + contentToAppend
        }

        return fileContent + contentToAppend
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
