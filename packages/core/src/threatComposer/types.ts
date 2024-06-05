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
    autoSaveFileState: Record<string, FileWatchInfo>
    loaderNotification: undefined | LoaderNotification
    fileId: string
}

export type LoaderNotification = {
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>
    cancellationToken: vscode.CancellationToken
    promiseResolve: any
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
    LOAD_STAGE = 'LOAD_STAGE',

    FILE_CHANGED = 'FILE_CHANGED',
    THEME_CHANGED = 'THEME_CHANGED',
    OVERWRITE_FILE = 'OVERWRITE_FILE',
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

export enum SaveCompleteSubType {
    SAVED = 'SAVED',
    SAVE_SKIPPED_SAME_CONTENT = 'SAVE_SKIPPED_SAME_CONTENT',
    SAVE_SKIPPED_SAME_JSON = 'SAVE_SKIPPED_SAME_CONTENT',
    SAVE_FAILED = 'SAVE_FAILED',
}

export interface SaveFileResponseMessage extends Message {
    filePath: string
    isSuccess: boolean
    saveCompleteSubType: SaveCompleteSubType
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
    notificationType: 'INVALID_JSON' | undefined
}

export interface EmitTelemetryMessage extends Message {
    eventId?: string
    eventType: TelemetryType
    metadata?: string
}

export interface LoadStageMessage extends Message {
    loadStage: 'API_LOADED' | 'RENDER_COMPLETE'
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
