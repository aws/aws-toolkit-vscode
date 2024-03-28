/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, writeFileSync } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BuildSystem, FolderInfo, transformByQState } from '../../models/model'
import * as CodeWhispererConstants from '../../models/constants'

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
    writeFileSync(logFilePath, transformByQState.getErrorLog())
    return logFilePath
}

export async function checkBuildSystem(projectPath: string) {
    const mavenBuildFilePath = path.join(projectPath, 'pom.xml')
    if (existsSync(mavenBuildFilePath)) {
        return BuildSystem.Maven
    }
    return BuildSystem.Unknown
}
