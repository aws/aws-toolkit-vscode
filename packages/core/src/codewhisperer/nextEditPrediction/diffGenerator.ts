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
export async function generateUnifiedDiffWithTimestamps(
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
        `${oldTimestamp}`, // Old file label with timestamp
        `${newTimestamp}`, // New file label with timestamp
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
 * @returns Array of SupplementalContext objects
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

    // Treat current content as the last snapshot
    const allContents = [
        ...snapshotContents,
        {
            filePath,
            content: currentContent,
            timestamp: currentTimestamp,
        },
    ]

    // Generate diffs between all adjacent snapshots (including current content)
    for (let i = 0; i < allContents.length - 1; i++) {
        const oldSnapshot = allContents[i]
        const newSnapshot = allContents[i + 1]

        try {
            const diff = await generateUnifiedDiffWithTimestamps(
                oldSnapshot.filePath,
                newSnapshot.filePath,
                oldSnapshot.content,
                newSnapshot.content,
                oldSnapshot.timestamp,
                newSnapshot.timestamp
            )

            supplementalContexts.push({
                filePath: oldSnapshot.filePath,
                content: diff,
                type: 'PreviousEditorState',
                metadata: {
                    previousEditorStateMetadata: {
                        timeOffset: currentTimestamp - oldSnapshot.timestamp,
                    },
                },
            })
        } catch (err) {
            getLogger().error(`Failed to generate diff: ${err}`)
        }
    }

    // Limit the number of supplemental contexts based on config
    if (supplementalContexts.length > maxContexts) {
        return supplementalContexts.slice(-maxContexts)
    }

    return supplementalContexts
}
