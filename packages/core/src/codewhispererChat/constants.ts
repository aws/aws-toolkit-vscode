/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import fs from '../shared/fs/fs'

export const promptFileExtension = '.md'

export const additionalContentInnerContextLimit = 8192

export const aditionalContentNameLimit = 1024

// temporary limit for @workspace and @file combined context length
export const contextMaxLength = 40_000

export const getUserPromptsDirectory = () => {
    return path.join(fs.getUserHomeDir(), '.aws', 'amazonq', 'prompts')
}

export const createSavedPromptCommandId = 'create-saved-prompt'
