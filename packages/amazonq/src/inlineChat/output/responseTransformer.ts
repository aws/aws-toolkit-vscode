/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from 'aws-core-vscode/shared'
import { decode } from 'he'
import { InlineTask } from '../controller/inlineTask'

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

function extractPartialCode(response: string, inlineTask: InlineTask): [string, string] {
    const lineCount = response.split('\n').length
    const splitLines = inlineTask.selectedText.split('\n')
    const left = splitLines.slice(0, lineCount).join('\n')
    const right = splitLines.slice(lineCount).join('\n')
    return [left, right]
}
