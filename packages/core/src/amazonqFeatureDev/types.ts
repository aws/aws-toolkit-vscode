/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VirtualFileSystem } from '../shared/virtualFilesystem'
import type { CancellationTokenSource } from 'vscode'
import { Messenger } from './controllers/chat/messenger/messenger'
import { FeatureDevClient } from './client/featureDev'
import { TelemetryHelper } from './util/telemetryHelper'
import { CodeReference, UploadHistory } from '../amazonq/webview/ui/connector'
import { DiffTreeFileInfo } from '../amazonq/webview/ui/diffTree/types'

export type Interaction = {
    // content to be sent back to the chat UI
    content?: string
    responseType?: LLMResponseType
}

export interface SessionStateInteraction {
    nextState: SessionState | Omit<SessionState, 'uploadId'> | undefined
    interaction: Interaction
    currentCodeGenerationId?: string
}

export enum DevPhase {
    INIT = 'Init',
    APPROACH = 'Approach',
    CODEGEN = 'Codegen',
}

export enum CodeGenerationStatus {
    COMPLETE = 'Complete',
    PREDICT_READY = 'predict-ready',
    IN_PROGRESS = 'InProgress',
    PREDICT_FAILED = 'predict-failed',
    DEBATE_FAILED = 'debate-failed',
    FAILED = 'Failed',
}

export enum FollowUpTypes {
    GenerateCode = 'GenerateCode',
    InsertCode = 'InsertCode',
    ProvideFeedbackAndRegenerateCode = 'ProvideFeedbackAndRegenerateCode',
    Retry = 'Retry',
    ModifyDefaultSourceFolder = 'ModifyDefaultSourceFolder',
    DevExamples = 'DevExamples',
    NewTask = 'NewTask',
    CloseSession = 'CloseSession',
    SendFeedback = 'SendFeedback',
}

export type SessionStatePhase = DevPhase.INIT | DevPhase.CODEGEN

export type CurrentWsFolders = [vscode.WorkspaceFolder, ...vscode.WorkspaceFolder[]]

export interface SessionState {
    readonly filePaths?: NewFileInfo[]
    readonly deletedFiles?: DeletedFileInfo[]
    readonly references?: CodeReference[]
    readonly phase?: SessionStatePhase
    readonly uploadId: string
    readonly currentIteration?: number
    currentCodeGenerationId?: string
    tokenSource?: CancellationTokenSource
    readonly codeGenerationId?: string
    readonly tabID: string
    interact(action: SessionStateAction): Promise<SessionStateInteraction>
    updateWorkspaceRoot?: (workspaceRoot: string) => void
    codeGenerationRemainingIterationCount?: number
    codeGenerationTotalIterationCount?: number
    uploadHistory?: UploadHistory
}

export interface SessionStateConfig {
    workspaceRoots: string[]
    workspaceFolders: CurrentWsFolders
    conversationId: string
    proxyClient: FeatureDevClient
    uploadId: string
    currentCodeGenerationId?: string
}

export interface SessionStateAction {
    task: string
    msg: string
    messenger: Messenger
    fs: VirtualFileSystem
    telemetry: TelemetryHelper
    uploadHistory?: UploadHistory
    tokenSource?: CancellationTokenSource
}

export type NewFileZipContents = { zipFilePath: string; fileContent: string }
export type NewFileInfo = DiffTreeFileInfo &
    NewFileZipContents & {
        virtualMemoryUri: vscode.Uri
        workspaceFolder: vscode.WorkspaceFolder
    }

export type DeletedFileInfo = DiffTreeFileInfo & {
    workspaceFolder: vscode.WorkspaceFolder
}

export interface SessionInfo {
    // TODO, if it had a summarized name that was better for the UI
    name?: string
    history: string[]
}

export interface SessionStorage {
    [key: string]: SessionInfo
}

export type LLMResponseType = 'EMPTY' | 'INVALID_STATE' | 'VALID'
