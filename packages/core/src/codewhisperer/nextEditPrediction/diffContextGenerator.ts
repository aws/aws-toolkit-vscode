/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as diff from 'diff'
import { getLogger } from '../../shared/logger/logger'
import * as codewhispererClient from '../client/codewhisperer'
import { supplementalContextMaxTotalLength, charactersLimit } from '../models/constants'

const logger = getLogger('nextEditPrediction')

/**
 * Generates a unified diff format between old and new file contents
 */
function generateUnifiedDiffWithTimestamps(
    oldFilePath: string,
    newFilePath: string,
    oldContent: string,
    newContent: string,
    oldTimestamp: number,
    newTimestamp: number,
    contextSize: number = 3
): string {
    const patchResult = diff.createTwoFilesPatch(
        oldFilePath,
        newFilePath,
        oldContent,
        newContent,
        String(oldTimestamp),
        String(newTimestamp),
        { context: contextSize }
    )

    // Remove unused headers
    const lines = patchResult.split('\n')
    if (lines.length >= 2 && lines[0].startsWith('Index:')) {
        lines.splice(0, 2)
        return lines.join('\n')
    }

    return patchResult
}

export interface SnapshotContent {
    filePath: string
    content: string
    timestamp: number
}

/**
 * Generates supplemental contexts from snapshot contents and current content
 *
 * @param filePath - Path to the file
 * @param currentContent - Current content of the file
 * @param snapshotContents - List of snapshot contents sorted by timestamp (oldest first)
 * @param maxContexts - Maximum number of supplemental contexts to return
 * @returns Array of SupplementalContext objects, T_0 being the snapshot of current file content:
 *  U0: udiff of T_0 and T_1
 *  U1: udiff of T_0 and T_2
 *  U2: udiff of T_0 and T_3
 */
export function generateDiffContexts(
    filePath: string,
    currentContent: string,
    snapshotContents: SnapshotContent[],
    maxContexts: number
): codewhispererClient.SupplementalContext[] {
    if (snapshotContents.length === 0) {
        return []
    }

    const supplementalContexts: codewhispererClient.SupplementalContext[] = []
    const currentTimestamp = Date.now()

    for (let i = snapshotContents.length - 1; i >= 0; i--) {
        const snapshot = snapshotContents[i]
        try {
            const unifiedDiff = generateUnifiedDiffWithTimestamps(
                snapshot.filePath,
                filePath,
                snapshot.content,
                currentContent,
                snapshot.timestamp,
                currentTimestamp
            )

            supplementalContexts.push({
                filePath: snapshot.filePath,
                content: unifiedDiff,
                type: 'PreviousEditorState',
                metadata: {
                    previousEditorStateMetadata: {
                        timeOffset: currentTimestamp - snapshot.timestamp,
                    },
                },
            })
        } catch (err) {
            logger.error(`Failed to generate diff: ${err}`)
        }
    }

    const trimmedContext = trimSupplementalContexts(supplementalContexts, maxContexts)
    logger.debug(
        `supplemental contexts: ${trimmedContext.length} contexts, total size: ${trimmedContext.reduce((sum, ctx) => sum + ctx.content.length, 0)} characters`
    )
    return trimmedContext
}

/**
 * Trims the supplementalContexts array to ensure it doesn't exceed the max number
 * of contexts or total character length limit
 *
 * @param supplementalContexts - Array of SupplementalContext objects (already sorted with newest first)
 * @param maxContexts - Maximum number of supplemental contexts allowed
 * @returns Trimmed array of SupplementalContext objects
 */
function trimSupplementalContexts(
    supplementalContexts: codewhispererClient.SupplementalContext[],
    maxContexts: number
): codewhispererClient.SupplementalContext[] {
    if (supplementalContexts.length === 0) {
        return supplementalContexts
    }

    // First filter out any individual context that exceeds the character limit
    let result = supplementalContexts.filter((context) => {
        return context.content.length <= charactersLimit
    })

    // Then limit by max number of contexts
    if (result.length > maxContexts) {
        result = result.slice(0, maxContexts)
    }

    // Lastly enforce total character limit
    let totalLength = 0
    let i = 0

    while (i < result.length) {
        totalLength += result[i].content.length
        if (totalLength > supplementalContextMaxTotalLength) {
            break
        }
        i++
    }

    if (i === result.length) {
        return result
    }

    const trimmedContexts = result.slice(0, i)
    return trimmedContexts
}
