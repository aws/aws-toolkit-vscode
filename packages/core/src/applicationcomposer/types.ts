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
    fileWatches: Record<string, FileWatchInfo>
}

export type FileWatchInfo = {
    fileContents: string
}

export interface Message {
    command: Command
    messageType: MessageType
}

export enum Command {
    INIT = 'INIT',
    LOAD_FILE = 'LOAD_FILE',
    SAVE_FILE = 'SAVE_FILE',
    ADD_FILE_WATCH = 'ADD_FILE_WATCH',
    DEPLOY = 'DEPLOY',
    FILE_CHANGED = 'FILE_CHANGED',
    GENERATE_RESOURCE = 'GENERATE_RESOURCE',
    LOG = 'LOG',
    EMIT_TELEMETRY = 'EMIT_TELEMETRY',
    OPEN_FEEDBACK = 'OPEN_FEEDBACK',
}

export enum MessageType {
    REQUEST = 'REQUEST',
    RESPONSE = 'RESPONSE',
    BROADCAST = 'BROADCAST',
}

type TelemetryType =
    | 'GENERATE_CLICKED'
    | 'REGENERATE_CLICKED'
    | 'GENERATE_ACCEPTED'
    | 'GENERATE_REJECTED'
    | 'INVALID_GENERATION'
    | 'POST_PROCESS'
    | 'CUSTOMER_READY'
    | 'FPS'
    | 'ADD_RESOURCE'
    | 'ADD_CONNECTION'
    | 'OPEN_WFS'
    | 'CLOSE_WFS'
    | 'TEMPLATE_OPENED'

export interface InitResponseMessage extends Message {
    templateFileName: string
    templateFilePath: string
    isConnectedToCodeWhisperer: boolean
}

export interface LoadFileResponseMessage extends Message {
    eventId: string
    fileName: string
    fileContents: string
    isSuccess: boolean
    failureReason?: string
}

export interface SaveFileResponseMessage extends Message {
    eventId: string
    filePath: string
    isSuccess: boolean
    failureReason?: string
}

export interface AddFileWatchResponseMessage extends Message {
    eventId: string
    isSuccess: boolean
    failureReason?: string
}

export interface FileChangedMessage extends Message {
    fileName: string
    fileContents: string
}

export interface DeployRequestMessage extends Message {
    eventId: string
}

export interface DeployResponseMessage extends Message {
    eventId: string
    isSuccess: boolean
}

export interface RequestMessage extends Message {
    command: Command
}

export interface InitRequestMessage extends Message {
    eventId?: string
}

export interface LoadFileRequestMessage extends Message {
    eventId: string
    fileName: string
}

export interface SaveFileRequestMessage extends Message {
    eventId: string
    filePath: string
    fileContents: string
}

export interface AddFileWatchRequestMessage extends Message {
    eventId: string
    fileName: string
}

export interface NotifyUserRequestMessage extends Message {
    eventId?: string
    notification: string
    notificationType: 'INFO' | 'WARNING' | 'ERROR'
}

export interface LogMessage extends Message {
    eventId?: string
    logMessage: string
    logType: 'INFO' | 'WARNING' | 'ERROR'
}

export interface EmitTelemetryMessage extends Message {
    eventId?: string
    eventType: TelemetryType
    metadata?: string
}

export interface ReferenceDetails {
    title: string | undefined
    url: string | undefined
    snippet?: string
}

export interface GenerateResourceRequestMessage extends Message {
    prompt: string
    traceId: string
}

export interface GenerateResourceResponseMessage extends Message {
    chatResponse: string
    references: ReferenceDetails[]
    metadata: object
    isSuccess: boolean
    errorMessage?: string
    traceId: string
}
