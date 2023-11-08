/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { VirtualFileSystem } from '../shared/virtualFilesystem'
import type { CancellationTokenSource } from 'vscode'
import { Messenger } from './controllers/chat/messenger/messenger'
import { WeaverbirdClient } from './client/weaverbird'

const GenerationFlowOptions = ['fargate', 'lambda', 'stepFunction'] as const
type GenerationFlowOption = (typeof GenerationFlowOptions)[number]

export function isGenerationFlowOption(value: string): value is GenerationFlowOption {
    return GenerationFlowOptions.includes(value as GenerationFlowOption)
}

// TODO: Reintroduce WeaverbirdConfigs and remove any
export interface LLMConfig extends Required<any> {
    generationFlow: GenerationFlowOption
}

export type Interaction = {
    // content to be sent back to the chat UI
    content?: string
}

export interface SessionStateInteraction {
    nextState: SessionState | Omit<SessionState, 'uploadId'> | undefined
    interaction: Interaction
}

export enum FollowUpTypes {
    WriteCode = 'WriteCode',
    AcceptCode = 'AcceptCode',
    ProvideFeedbackAndRegenerateCode = 'ProvideFeedbackAndRegenerateCode',
    RejectCode = 'RejectCode',
    Retry = 'Retry',
}

export type SessionStatePhase = 'Init' | 'Approach' | 'Codegen'

export interface SessionState {
    readonly filePaths?: string[]
    readonly phase?: SessionStatePhase
    readonly uploadId: string
    approach: string
    readonly tokenSource: CancellationTokenSource
    readonly tabID: string
    interact(action: SessionStateAction): Promise<SessionStateInteraction>
}

export interface SessionStateConfig {
    llmConfig: LLMConfig
    workspaceRoot: string
    conversationId: string
    proxyClient: WeaverbirdClient
    uploadId: string
}

export interface SessionStateAction {
    task: string
    files: any[] // TODO: remove any
    msg?: string
    messenger: Messenger
    fs: VirtualFileSystem
}

export type NewFileContents = { filePath: string; fileContent: string }[]

export interface SessionInfo {
    // TODO, if it had a summarized name that was better for the UI
    name?: string
    history: string[]
}

export interface SessionStorage {
    [key: string]: SessionInfo
}
