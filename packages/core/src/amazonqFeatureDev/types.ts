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
import { CodeReference } from '../amazonq/webview/ui/connector'
import { DiffTreeFileInfo } from '../amazonq/webview/ui/diffTree/types'

/**
 * Represents an interaction in the chat UI.
 */
export type Interaction = {
    // content to be sent back to the chat UI
    content?: string
    responseType?: LLMResponseType
}

/**
 * Represents the interaction between the session state and the chat UI.
 */
export interface SessionStateInteraction {
    nextState: SessionState | Omit<SessionState, 'uploadId'> | undefined
    interaction: Interaction
}

/**
 * Enum representing different phases of development.
 */
export enum DevPhase {
    INIT = 'Init',
    APPROACH = 'Approach',
    CODEGEN = 'Codegen',
}

/**
 * Enum representing the status of code generation.
 */
export enum CodeGenerationStatus {
    COMPLETE = 'Complete',
    PREDICT_READY = 'predict-ready',
    IN_PROGRESS = 'InProgress',
    PREDICT_FAILED = 'predict-failed',
    DEBATE_FAILED = 'debate-failed',
    FAILED = 'Failed',
}

/**
 * Enum representing different types of follow-up actions.
 */
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

export type SessionStatePhase = DevPhase.INIT | DevPhase.APPROACH | DevPhase.CODEGEN

export type CurrentWsFolders = [vscode.WorkspaceFolder, ...vscode.WorkspaceFolder[]]

/**
 * Interface representing the state of a session.
 */
export interface SessionState {
    readonly filePaths?: NewFileInfo[]
    readonly deletedFiles?: DeletedFileInfo[]
    readonly references?: CodeReference[]
    readonly phase?: SessionStatePhase
    readonly uploadId: string
    approach: string
    readonly tokenSource: CancellationTokenSource
    readonly tabID: string
    interact(action: SessionStateAction): Promise<SessionStateInteraction>
    updateWorkspaceRoot?: (workspaceRoot: string) => void
    codeGenerationRemainingIterationCount?: number
    codeGenerationTotalIterationCount?: number
}

/**
 * Interface representing the configuration of a session state.
 */
export interface SessionStateConfig {
    workspaceRoots: string[]
    workspaceFolders: CurrentWsFolders
    conversationId: string
    proxyClient: FeatureDevClient
    uploadId: string
}

/**
 * Interface representing an action on the session state.
 */
export interface SessionStateAction {
    task: string
    msg: string
    messenger: Messenger
    fs: VirtualFileSystem
    telemetry: TelemetryHelper
}

export type NewFileZipContents = { zipFilePath: string; fileContent: string }
/**
 * Type representing information about a new file.
 */
export type NewFileInfo = DiffTreeFileInfo &
    NewFileZipContents & {
        virtualMemoryUri: vscode.Uri
        workspaceFolder: vscode.WorkspaceFolder
    }

/**
 * Type representing information about a deleted file.
 */
export type DeletedFileInfo = DiffTreeFileInfo & {
    workspaceFolder: vscode.WorkspaceFolder
}

/**
 * Interface representing information about a session.
 */
export interface SessionInfo {
    // TODO, if it had a summarized name that was better for the UI
    name?: string
    history: string[]
}

/**
 * Interface representing storage for sessions.
 */
export interface SessionStorage {
    [key: string]: SessionInfo
}

export type LLMResponseType = 'EMPTY' | 'INVALID_STATE' | 'VALID'
