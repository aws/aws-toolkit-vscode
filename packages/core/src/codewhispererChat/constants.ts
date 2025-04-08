/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import fs from '../shared/fs/fs'
import { Tool } from '@amzn/codewhisperer-streaming'
import toolsJson from '../codewhispererChat/tools/tool_index.json'
import { ContextLengths } from './controllers/chat/model'

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

export const tools: Tool[] = Object.entries(toolsJson).map(([, toolSpec]) => ({
    toolSpecification: {
        ...toolSpec,
        inputSchema: { json: toolSpec.inputSchema },
    },
}))

export const noWriteTools: Tool[] = tools.filter(
    (tool) => !['fsWrite', 'executeBash'].includes(tool.toolSpecification?.name || '')
)

export const defaultContextLengths: ContextLengths = {
    additionalContextLengths: {
        fileContextLength: 0,
        promptContextLength: 0,
        ruleContextLength: 0,
    },
    truncatedAdditionalContextLengths: {
        fileContextLength: 0,
        promptContextLength: 0,
        ruleContextLength: 0,
    },
    workspaceContextLength: 0,
    truncatedWorkspaceContextLength: 0,
    userInputContextLength: 0,
    truncatedUserInputContextLength: 0,
    focusFileContextLength: 0,
    truncatedFocusFileContextLength: 0,
}

export const defaultStreamingResponseTimeoutInMs = 180_000
