/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

export type WebviewContext = {
    panel: vscode.WebviewPanel
    textDocument: vscode.TextDocument
    disposables: vscode.Disposable[]
    workSpacePath: string
    defaultTemplatePath: string
    defaultTemplateName: string
    fileStates: Record<string, FileWatchInfo>
    loaderNotification: undefined | LoaderNotification
    fileId: string
}

export type LoaderNotification = {
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>
    cancellationToken: vscode.CancellationToken
    resolve: () => void
}

export enum MessageType {
    REQUEST = 'REQUEST',
    RESPONSE = 'RESPONSE',
    BROADCAST = 'BROADCAST',
}

export enum Command {
    INIT = 'INIT',
    SAVE_FILE = 'SAVE_FILE',
    AUTO_SAVE_FILE = 'AUTO_SAVE_FILE',
    FILE_CHANGED = 'FILE_CHANGED',
    LOAD_STAGE = 'LOAD_STAGE',
    OPEN_FEEDBACK = 'OPEN_FEEDBACK',
}

export type FileWatchInfo = {
    fileContents: string
}

export enum SaveCompleteSubType {
    SAVED = 'SAVED',
    SAVE_SKIPPED_SAME_CONTENT = 'SAVE_SKIPPED_SAME_CONTENT',
    SAVE_FAILED = 'SAVE_FAILED',
}

export interface Message {
    command: Command
    messageType: MessageType
}

export type FileChangeEventTrigger = 'INITIAL_RENDER' | 'MANUAL_SAVE'

export interface FileChangedMessage extends Message {
    fileName: string
    fileContents: string
    filePath: string
    trigger: FileChangeEventTrigger
}

export interface InitResponseMessage extends Omit<FileChangedMessage, 'trigger'> {
    isSuccess: boolean
    failureReason?: string
}

export interface SaveFileRequestMessage extends Message {
    fileContents: string
}
