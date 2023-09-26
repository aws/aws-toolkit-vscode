/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { VirtualFileSystem } from '../../../shared/virtualFilesystem'
import { LLMConfig, LocalResolvedConfig } from '../../types'

/**
 * Data class for holding all the relevant details for a session
 *
 * TODO add weaverbird setting handler so that when an aws.weaverbird setting changes, the corresponding LLM config is changed
 */
export class SessionConfig {
    constructor(
        public readonly client: LambdaClient,
        public readonly llmConfig: LLMConfig,
        public readonly workspaceRoot: string,
        public readonly backendConfig: LocalResolvedConfig,
        public readonly fs: VirtualFileSystem
    ) {}
}
