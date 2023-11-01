/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

export type WebviewContext = {
    panel: vscode.WebviewPanel
    textDocument: vscode.TextDocument
    disposables?: vscode.Disposable[]
    workSpacePath: string
    defaultTemplatePath: string
    fileWatchs: Record<string, FileWatchInfo>
}

export type FileWatchInfo = {
    fileContents: string
}

export enum Response {
    INIT = 'INIT',
    LOAD_FILE = 'LOAD_FILE',
    SAVE_FILE = 'SAVE_FILE',
    ADD_FILE_WATCH = 'ADD_FILE_WATCH',
    FILE_CHANGED = 'FILE_CHANGED',
}

export interface ResponseMessage {
    response: Response
}

export interface InitResponseMessage extends ResponseMessage {
    templateFileName: string
    templateFilePath: string
}

export interface LoadFileResponseMessage extends ResponseMessage {
    eventId: string
    fileName: string
    filePath: string
    initFileContents: string
}

export interface SaveFileResponseMessage extends ResponseMessage {
    eventId: string
    status: boolean
}

export interface AddFileWatchResponseMessage extends ResponseMessage {
    eventId: string
    status: boolean
}

export interface FileChangedResponseMessage extends ResponseMessage {
    fileName: string
    fileContents: string
}

export enum Command {
    INIT = 'INIT',
    LOAD_FILE = 'LOAD_FILE',
    SAVE_FILE = 'SAVE_FILE',
    ADD_FILE_WATCH = 'ADD_FILE_WATCH',
}

export interface RequestMessage {
    command: Command
}

export interface InitRequestMessage extends RequestMessage {
    eventId?: string
}

export interface LoadFileRequestMessage extends RequestMessage {
    eventId: string
    fileName: string
    filePath: string
}

export interface SaveFileRequestMessage extends RequestMessage {
    eventId: string
    fileName: string
    filePath: string
    fileContents: string
}

export interface AddFileWatchRequestMessage extends RequestMessage {
    eventId: string
    fileName: string
    filePath: string
}
