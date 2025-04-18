/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as diff from 'diff'

/**
 * Class to generate a unified diff format between old and new file contents
 */
export class DiffGenerator {
    /**
     * @param oldFilePath - Path of the old file
     * @param newFilePath - Path of the new file
     * @param oldContent - Content of the old file
     * @param newContent - Content of the new file
     * @param oldTimestamp - Timestamp of the old file version
     * @param newTimestamp - Timestamp of the new file version
     * @param contextSize - Number of context lines to include (default: 3)
     * @returns Unified diff as a string
     */
    public static async generateUnifiedDiffWithTimestamps(
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

        // Remove the "Index:" line and the separator line that follows it
        const lines = patchResult.split('\n')
        if (lines.length >= 2 && lines[0].startsWith('Index:')) {
            lines.splice(0, 2)
            return lines.join('\n')
        }

        return patchResult
    }
}
