/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from 'aws-core-vscode/shared'
import { decode } from 'he'
import { InlineTask } from '../controller/inlineTask'

/**
 * Transforms the response from the INLINE_CHAT GenerateAssistantResponse call.
 *
 * @param response - The raw response string from GenerateAssistantResponse.
 * @param inlineTask - The inline task object containing information about the current task.
 * @param isWholeResponse - A boolean indicating whether this is a complete response or a partial one.
 * @returns The decoded response string, or undefined if an error occurs.
 */
export function responseTransformer(
    response: string,
    inlineTask: InlineTask,
    isWholeResponse: boolean
): string | undefined {
    try {
        const decodedResponse = decode(response)
        if (!isWholeResponse) {
            const [partialSelectedCode, right] = extractPartialCode(decodedResponse, inlineTask)
            inlineTask.partialSelectedText = partialSelectedCode
            inlineTask.partialSelectedTextRight = right
            return decodedResponse
        } else {
            return decodedResponse
        }
    } catch (err) {
        getLogger().error('An unknown error occurred: %s', (err as Error).message)
        return undefined
    }
}

/**
 * This function is used to handle partial responses in inline tasks. It divides
 * the selected text into two parts:
 * 1. The "left" part, which contains the same number of lines as the response.
 * 2. The "right" part, which contains the remaining lines.
 *
 * @param response - The response string from the assistant.
 * @param inlineTask - The inline task object containing the full selected text.
 * @returns A tuple with two strings: [leftPart, rightPart].
 */
function extractPartialCode(response: string, inlineTask: InlineTask): [string, string] {
    const lineCount = response.split('\n').length
    const splitLines = inlineTask.selectedText.split('\n')
    const left = splitLines.slice(0, lineCount).join('\n')
    const right = splitLines.slice(lineCount).join('\n')
    return [left, right]
}
