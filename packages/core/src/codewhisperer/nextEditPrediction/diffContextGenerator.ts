/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as diff from 'diff'
import { getLogger } from '../../shared/logger/logger'
import * as codewhispererClient from '../client/codewhisperer'

/**
 * Generates a unified diff format between old and new file contents
 *
 * @param oldFilePath - Path of the old file
 * @param newFilePath - Path of the new file
 * @param oldContent - Content of the old file
 * @param newContent - Content of the new file
 * @param oldTimestamp - Timestamp of the old file version
 * @param newTimestamp - Timestamp of the new file version
 * @param contextSize - Number of context lines to include (default: 3)
 * @returns Unified diff as a string
 */
async function generateUnifiedDiffWithTimestamps(
    oldFilePath: string,
    newFilePath: string,
    oldContent: string,
    newContent: string,
    oldTimestamp: number,
    newTimestamp: number,
    contextSize: number = 3
): Promise<string> {
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

/**
 * Interface for snapshot content with timestamp
 */
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
export async function generateDiffContexts(
    filePath: string,
    currentContent: string,
    snapshotContents: SnapshotContent[],
    maxContexts: number
): Promise<codewhispererClient.SupplementalContext[]> {
    if (snapshotContents.length === 0) {
        return []
    }

    const supplementalContexts: codewhispererClient.SupplementalContext[] = []
    const currentTimestamp = Date.now()

    // Create a copy of snapshots and reverse it so newest snapshots are processed first
    const sortedSnapshots = [...snapshotContents].reverse()

    // Generate diffs between each snapshot and the current content
    for (const snapshot of sortedSnapshots) {
        try {
            const unifiedDiff = await generateUnifiedDiffWithTimestamps(
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
            getLogger().error(`Failed to generate diff: ${err}`)
        }
    }

    // Limit the number of supplemental contexts based on config
    if (supplementalContexts.length > maxContexts) {
        return supplementalContexts.slice(0, maxContexts)
    }

    return supplementalContexts
}
