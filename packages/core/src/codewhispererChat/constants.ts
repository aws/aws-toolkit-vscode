/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import fs from '../shared/fs/fs'

export const promptFileExtension = '.md'

// limit for each entry of @prompt, @rules, @files and @folder
export const additionalContentInnerContextLimit = 8192

export const aditionalContentNameLimit = 1024

// limit for each chunk of @workspace
export const workspaceChunkMaxSize = 40_960

export const getUserPromptsDirectory = () => {
    return path.join(fs.getUserHomeDir(), '.aws', 'amazonq', 'prompts')
}

export const createSavedPromptCommandId = 'create-saved-prompt'
