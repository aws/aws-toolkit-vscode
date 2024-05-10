/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VirtualFileSystem } from '../shared/virtualFilesystem'
import type { CancellationTokenSource } from 'vscode'
import { Messenger } from './controllers/chat/messenger/messenger'
import { FeatureDevClient } from './client/featureDev'
import { featureDevScheme } from './constants'
import { TelemetryHelper } from './util/telemetryHelper'
import { CodeReference } from '../amazonq/webview/ui/connector'
import { DiffTreeFileInfo } from '../amazonq/webview/ui/diffTree/types'

export type Interaction = {
    // content to be sent back to the chat UI
    content?: string
    responseType?: LLMResponseType
}

export interface SessionStateInteraction {
    nextState: SessionState | Omit<SessionState, 'uploadId'> | undefined
    interaction: Interaction
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

export type SessionStatePhase = 'Init' | 'Approach' | 'Codegen'

export type CurrentWsFolders = [vscode.WorkspaceFolder, ...vscode.WorkspaceFolder[]]

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
}

export interface SessionStateConfig {
    workspaceRoots: string[]
    workspaceFolders: CurrentWsFolders
    conversationId: string
    proxyClient: FeatureDevClient
    uploadId: string
}

export interface SessionStateAction {
    task: string
    msg: string
    messenger: Messenger
    fs: VirtualFileSystem
    telemetry: TelemetryHelper
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

export function createUri(filePath: string, tabID?: string) {
    return vscode.Uri.from({
        scheme: featureDevScheme,
        path: filePath,
        ...(tabID ? { query: `tabID=${tabID}` } : {}),
    })
}

export type LLMResponseType = 'EMPTY' | 'INVALID_STATE' | 'VALID'
