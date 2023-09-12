/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LLMConfig {
    model: string
    maxTokensToSample: number
    temperature: number
    debateRounds: number
    generationFlow: 'fargate' | 'lambda' | 'stepFunction'
}
