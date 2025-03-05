/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { IAM, StepFunctions } from 'aws-sdk'
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
    SAVE_FILE_AND_DEPLOY = 'SAVE_FILE_AND_DEPLOY',
    AUTO_SYNC_FILE = 'AUTO_SYNC_FILE',
    FILE_CHANGED = 'FILE_CHANGED',
    LOAD_STAGE = 'LOAD_STAGE',
    OPEN_FEEDBACK = 'OPEN_FEEDBACK',
    CLOSE_WFS = 'CLOSE_WFS',
    API_CALL = 'API_CALL',
    UNSUPPORTED_COMMAND = 'UNSUPPORTED_COMMAND',
}

export type FileWatchInfo = {
    fileContents: string
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

export interface UnsupportedMessage extends Message {
    originalMessage: Message
}

export interface InitResponseMessage extends Omit<FileChangedMessage, 'trigger'> {
    isSuccess: boolean
    failureReason?: string
}

export interface SaveFileRequestMessage extends Message {
    isInvalidJson: boolean
}

export interface SyncFileRequestMessage extends SaveFileRequestMessage {
    fileContents: string
}

export enum ApiAction {
    IAMListRoles = 'iam:ListRoles',
    SFNTestState = 'sfn:TestState',
}

type ApiCallRequestMapping = {
    [ApiAction.IAMListRoles]: IAM.ListRolesRequest
    [ApiAction.SFNTestState]: StepFunctions.TestStateInput
}

interface ApiCallRequestMessageBase<ApiName extends ApiAction> extends Message {
    requestId: string
    apiName: ApiName
    params: ApiCallRequestMapping[ApiName]
}

/**
 * The message from the webview describing what API and parameters to call.
 */
export type ApiCallRequestMessage =
    | ApiCallRequestMessageBase<ApiAction.IAMListRoles>
    | ApiCallRequestMessageBase<ApiAction.SFNTestState>
