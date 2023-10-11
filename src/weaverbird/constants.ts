/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LLMConfig } from './types'

export const defaultLlmConfig: LLMConfig = {
    model: 'bedrock-claude-v2',
    generationFlow: 'stepFunction',
    maxTokensToSample: 50000,
    temperature: 0.0,
    debateRounds: 2,
}

// The Scheme name of the virtual documents.
export const weaverbirdScheme = 'aws-weaverbird'

// For uniquely identifiying which chat messages should be routed to Weaverbird
export const weaverbirdChat = 'weaverbirdChat'
