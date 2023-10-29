/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

export type WebviewContext = {
    panel: vscode.WebviewPanel
    textDocument: vscode.TextDocument
    disposables: vscode.Disposable[]
}

export enum Response {
    INIT = 'INIT',
    LOAD_FILE = 'LOAD_FILE',
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

export enum Command {
    INIT = 'INIT',
    LOAD_FILE = 'LOAD_FILE',
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
