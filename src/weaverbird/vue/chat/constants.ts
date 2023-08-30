/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LLMConfig } from './types'

export const defaultLlmConfig: LLMConfig = {
    model: 'claude-2',
    maxTokensToSample: 50000,
    temperature: 0.0,
    debateRounds: 2,
}
