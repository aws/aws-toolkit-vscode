/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LambdaClient } from '../../shared/clients/lambdaClient'
import { Settings } from '../../shared/settings'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { LLMConfig, LocalResolvedConfig, isGenerationFlowOption } from '../types'

/**
 * Data class for holding all the relevant details for a session
 */
export class SessionConfig {
    constructor(
        public readonly client: LambdaClient,
        public readonly llmConfig: LLMConfig,
        public readonly workspaceRoot: string,
        public readonly backendConfig: LocalResolvedConfig,
        public readonly fs: VirtualFileSystem
    ) {
        Settings.instance.onDidChangeSection('aws.weaverbird', event => {
            if (event.affectsConfiguration('debateRounds')) {
                this.llmConfig.debateRounds = Settings.instance.get(
                    'aws.weaverbird.debateRounds',
                    Number,
                    this.llmConfig.debateRounds
                )
            }
            if (event.affectsConfiguration('debateParticipantsCount')) {
                this.llmConfig.debateParticipantsCount = Settings.instance.get(
                    'aws.weaverbird.debateParticipantsCount',
                    Number,
                    this.llmConfig.debateParticipantsCount
                )
            }
            if (event.affectsConfiguration('generationFlow')) {
                const generationFlow = Settings.instance.get(
                    'aws.weaverbird.generationFlow',
                    String,
                    this.llmConfig.generationFlow
                )
                if (isGenerationFlowOption(generationFlow)) {
                    this.llmConfig.generationFlow = generationFlow
                }
            }
            if (event.affectsConfiguration('maxTokensToSample')) {
                this.llmConfig.maxTokensToSample = Settings.instance.get(
                    'aws.weaverbird.maxTokensToSample',
                    Number,
                    this.llmConfig.maxTokensToSample
                )
            }
            if (event.affectsConfiguration('model')) {
                this.llmConfig.model = Settings.instance.get('aws.weaverbird.model', String, this.llmConfig.model)
            }
            if (event.affectsConfiguration('modelTemperature')) {
                this.llmConfig.temperature = Settings.instance.get(
                    'aws.weaverbird.modelTemperature',
                    Number,
                    this.llmConfig.temperature
                )
            }
        })
    }
}
