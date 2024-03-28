/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { FolderInfo, transformByQState, TransformByQStoppedError } from '../../models/model'
import * as CodeWhispererConstants from '../../models/constants'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'

export function getDependenciesFolderInfo(): FolderInfo {
    const dependencyFolderName = `${CodeWhispererConstants.dependencyFolderName}${Date.now()}`
    const dependencyFolderPath = path.join(os.tmpdir(), dependencyFolderName)
    return {
        name: dependencyFolderName,
        path: dependencyFolderPath,
    }
}

export async function writeLogs() {
    const logFilePath = path.join(os.tmpdir(), 'build-logs.txt')
    fs.writeFileSync(logFilePath, transformByQState.getErrorLog())
    return logFilePath
}

export function throwIfCancelled() {
    if (transformByQState.isCancelled()) {
        throw new TransformByQStoppedError()
    }
}
