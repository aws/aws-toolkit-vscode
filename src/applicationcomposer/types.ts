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
    GENERATE_RESOURCE = 'GENERATE_RESOURCE',
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
    isSuccess: boolean
}

export interface SaveFileResponseMessage extends ResponseMessage {
    eventId: string
    isSuccess: boolean
}

export interface AddFileWatchResponseMessage extends ResponseMessage {
    eventId: string
    isSuccess: boolean
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
    DEPLOY = 'DEPLOY',
    GENERATE_RESOURCE = 'GENERATE_RESOURCE',
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

export interface ReferenceDetails {
    title: string | undefined
    url: string | undefined
    snippet?: string
}

export interface GenerateResourceMessage extends RequestMessage {
    prompt: string
}

export interface GenerateResourceResponseMessage {
    chatResponse: string
    references: ReferenceDetails[]
    metadata: object
}
