/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvokeOutput, OutputKind, sanitizePath } from './toolShared'
import { getLogger } from '../../shared/logger/logger'
import vscode from 'vscode'
import { fs } from '../../shared/fs/fs'

interface BaseCommand {
    path: string
}

export interface CreateCommand extends BaseCommand {
    command: 'create'
    fileText?: string
    newStr?: string
}

export interface StrReplaceCommand extends BaseCommand {
    command: 'str_replace'
    oldStr: string
    newStr: string
}

export interface InsertCommand extends BaseCommand {
    command: 'insert'
    insertLine: number
    newStr: string
}

export interface AppendCommand extends BaseCommand {
    command: 'append'
    newStr: string
}

export type FsWriteCommand = CreateCommand | StrReplaceCommand | InsertCommand | AppendCommand

export class FsWrite {
    private static readonly logger = getLogger('fsWrite')

    public static async invoke(command: FsWriteCommand): Promise<InvokeOutput> {
        const sanitizedPath = sanitizePath(command.path)

        switch (command.command) {
            case 'create':
                await this.handleCreate(command, sanitizedPath)
                break
            case 'str_replace':
                await this.handleStrReplace(command, sanitizedPath)
                break
            case 'insert':
                await this.handleInsert(command, sanitizedPath)
                break
            case 'append':
                await this.handleAppend(command, sanitizedPath)
                break
        }

        return {
            output: {
                kind: OutputKind.Text,
                content: '',
            },
        }
    }

    private static async handleCreate(command: CreateCommand, sanitizedPath: string): Promise<void> {
        const content = this.getCreateCommandText(command)

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

    private static async handleStrReplace(command: StrReplaceCommand, sanitizedPath: string): Promise<void> {
        // TODO
    }

    private static async handleInsert(command: InsertCommand, sanitizedPath: string): Promise<void> {
        // TODO
    }

    private static async handleAppend(command: AppendCommand, sanitizedPath: string): Promise<void> {
        // TODO
    }

    private static getCreateCommandText(command: CreateCommand): string {
        if (command.fileText) {
            return command.fileText
        }
        if (command.newStr) {
            this.logger.warn('Required field `fileText` is missing, use the provided `newStr` instead')
            return command.newStr
        }
        this.logger.warn('No content provided for the create command')
        return ''
    }
}
