/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { getLogger } from '.'
import { fsCommon } from '../../srcShared/fs'

const defaultCleanupParams = {
    maxLogs: 100,
    maxFileSize: 100000000, // 100 MB
    maxKeptLogs: 20,
    minKeptLogs: 2,
}

/**
 * Deletes the older logs when there are too many or are using too much space.
 */
export async function cleanLogFiles(logDir: string, params = defaultCleanupParams): Promise<void> {
    let files = await readdir(logDir)

    if (files.length > params.maxLogs) {
        await deleteOldLogFiles(logDir, files, params.maxKeptLogs)
        files = await readdir(logDir)
    }

    let dirSize = 0
    const oversizedFiles: string[] = []
    for (const log of files) {
        const logFullPath = path.join(logDir, log)
        let logSize: number = 0
        try {
            logSize = (await fsCommon.stat(logFullPath))!.size
        } catch (e) {
            getLogger().error('cleanLogFiles: fs.stat() failed on file "%s": %s', logFullPath, (e as Error).message)
        }
        if (logSize > params.maxFileSize) {
            oversizedFiles.push(log)
        }
        dirSize += logSize
    }
    // remove any single files over 100MB
    if (oversizedFiles.length) {
        await deleteOldLogFiles(logDir, oversizedFiles, 0)
        files = await readdir(logDir)
    }
    if (dirSize > params.maxFileSize) {
        await deleteOldLogFiles(logDir, files, params.minKeptLogs)
    }
}

/**
 * Convenience function to get only the file name
 * from the readdir() call.
 */
async function readdir(dir: string): Promise<string[]> {
    return (await fsCommon.readdir(dir)).map(f => f[0])
}

/**
 * Deletes the oldest created files, leaving the desired quantity of latest files.
 */
async function deleteOldLogFiles(logDir: string, files: string[], keepLatest: number): Promise<void> {
    files.sort()
    // This removes the latest files, leaving only the files to be deleted
    files.length = files.length >= keepLatest ? files.length - keepLatest : 0
    if (files.length) {
        getLogger().info(
            `Log folder contains more than 100 logs or is over 100MB. Deleted the ${files.length} oldest files`
        )
        for (const file of files) {
            try {
                await fsCommon.delete(path.join(logDir, file))
            } catch (error) {
                getLogger().error('cleanLogFiles: Failed to delete file: %s', file, (error as Error).message)
            }
        }
    }
}
