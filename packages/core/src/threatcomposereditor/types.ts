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
    autoSaveFileWatches: Record<string, FileWatchInfo>
}

export type FileWatchInfo = {
    fileContents: string
}

export interface Message {
    command: Command
    messageType: MessageType
}

export enum Command {
    AUTO_SAVE_FILE = 'AUTO_SAVE_FILE',
    SAVE_FILE = 'SAVE_FILE',
    LOG = 'LOG',
    EMIT_TELEMETRY = 'EMIT_TELEMETRY',
    OPEN_FEEDBACK = 'OPEN_FEEDBACK',
    INIT = 'INIT',
    RELOAD = 'RELOAD',

    FILE_CHANGED = 'FILE_CHANGED',
    THEME_CHANGED = 'THEME_CHANGED',
}

export enum MessageType {
    REQUEST = 'REQUEST',
    RESPONSE = 'RESPONSE',
    BROADCAST = 'BROADCAST',
}

enum TelemetryType {
    GENERATE_CLICKED = 'GENERATE_CLICKED',
    REGENERATE_CLICKED = 'REGENERATE_CLICKED',
    GENERATE_ACCEPTED = 'GENERATE_ACCEPTED',
    GENERATE_REJECTED = 'GENERATE_REJECTED',
    INVALID_GENERATION = 'INVALID_GENERATION',
    POST_PROCESS = 'POST_PROCESS',
    CUSTOMER_READY = 'CUSTOMER_READY',
    FPS = 'FPS',
    ADD_RESOURCE = 'ADD_RESOURCE',
    ADD_CONNECTION = 'ADD_CONNECTION',
    OPEN_WFS = 'OPEN_WFS',
    CLOSE_WFS = 'CLOSE_WFS',
}

export interface SaveFileResponseMessage extends Message {
    filePath: string
    isSuccess: boolean
    failureReason?: string
}

export interface FileChangedMessage extends Message {
    fileName: string
    fileContents: string
    filePath: string
}

export interface ThemeChangedMessage extends Message {
    newTheme: string
}

export interface SaveFileRequestMessage extends Message {
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
    showNotification: boolean
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

export interface GenerateResourceResponseMessage extends Message {
    chatResponse: string
    references: ReferenceDetails[]
    metadata: object
    isSuccess: boolean
    errorMessage?: string
    traceId: string
}
