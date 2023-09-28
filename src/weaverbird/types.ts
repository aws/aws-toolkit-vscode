/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileMetadata } from './client/weaverbirdclient'
import { VirtualFileSystem } from '../shared/virtualFilesystem'
import { LambdaClient } from '../shared/clients/lambdaClient'
import type { CancellationTokenSource } from 'vscode'
import { AddToChat } from './models'

const GenerationFlowOptions = ['fargate', 'lambda', 'stepFunction'] as const
type GenerationFlowOption = (typeof GenerationFlowOptions)[number]

export function isGenerationFlowOption(value: string): value is GenerationFlowOption {
    return GenerationFlowOptions.includes(value as GenerationFlowOption)
}

export interface LLMConfig {
    model: string
    maxTokensToSample: number
    temperature: number
    debateRounds: number
    generationFlow: GenerationFlowOption
}

export interface UserInteraction {
    origin: 'user' | 'ai'
    type: 'message'
    content: string
}

export interface CodeGenInteraction {
    origin: 'ai'
    type: 'codegen'
    content: string[]
    status?: 'accepted' | 'rejected' | 'iterating'
}

export type Interaction = UserInteraction | CodeGenInteraction

export interface SessionStateInteraction {
    nextState: SessionState | undefined
    interactions: Interaction[]
}

export interface SessionState {
    approach: string
    tokenSource: CancellationTokenSource
    interact(action: SessionStateAction): Promise<SessionStateInteraction>
}

export interface SessionStateConfig {
    client: LambdaClient
    llmConfig: LLMConfig
    workspaceRoot: string
    backendConfig: LocalResolvedConfig
    conversationId: string
}

export interface SessionStateAction {
    task: string
    files: FileMetadata[]
    msg?: string
    addToChat: AddToChat
    fs: VirtualFileSystem
}

export type NewFileContents = { filePath: string; fileContent: string }[]

export interface LocalResolvedConfig {
    endpoint: string
    region: string
    lambdaArns: {
        approach: {
            generate: string
            iterate: string
        }
        codegen: {
            generate: string
            getResults: string
            iterate: string
            getIterationResults: string
        }
    }
}

export interface SessionInfo {
    // TODO, if it had a summarized name that was better for the UI
    name?: string
    history: string[]
}

export interface SessionStorage {
    [key: string]: SessionInfo
}
