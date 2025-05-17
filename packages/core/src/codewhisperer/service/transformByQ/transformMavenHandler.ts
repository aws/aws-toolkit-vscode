/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { FolderInfo, transformByQState } from '../../models/model'
import { getLogger } from '../../../shared/logger/logger'
import * as CodeWhispererConstants from '../../models/constants'
// Consider using ChildProcess once we finalize all spawnSync calls
import { spawnSync } from 'child_process' // eslint-disable-line no-restricted-imports
import { setMaven } from './transformFileHandler'
import { throwIfCancelled } from './transformApiHandler'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import path from 'path'
import globals from '../../../shared/extensionGlobals'

function collectDependenciesAndMetadata(dependenciesFolderPath: string, workingDirPath: string) {
    getLogger().info('CodeTransformation: running mvn clean test-compile with maven JAR')

    const baseCommand = transformByQState.getMavenName()
    const jarPath = globals.context.asAbsolutePath(path.join('resources', 'amazonQCT', 'QCT-Maven-5-16.jar'))

    getLogger().info('CodeTransformation: running Maven extension with JAR')

    const args = [
        `-Dmaven.ext.class.path=${jarPath}`,
        `-Dcom.amazon.aws.developer.transform.jobDirectory=${dependenciesFolderPath}`,
        'clean',
        'test-compile',
    ]

    let environment = process.env
    if (transformByQState.getSourceJavaHome() !== undefined) {
        environment = { ...process.env, JAVA_HOME: transformByQState.getSourceJavaHome() }
    }

    const spawnResult = spawnSync(baseCommand, args, {
        cwd: workingDirPath,
        shell: true,
        encoding: 'utf-8',
        env: environment,
    })

    getLogger().info(
        `CodeTransformation: Ran mvn clean test-compile with maven JAR; status code = ${spawnResult.status}}`
    )

    if (spawnResult.status !== 0) {
        let errorLog = ''
        errorLog += spawnResult.error ? JSON.stringify(spawnResult.error) : ''
        errorLog += `${spawnResult.stderr}\n${spawnResult.stdout}`
        errorLog = errorLog.toLowerCase().replace('elasticgumby', 'QCT')
        transformByQState.appendToBuildLog(`mvn clean test-compile with maven JAR failed:\n${errorLog}`)
        getLogger().error(`CodeTransformation: Error in running mvn clean test-compile with maven JAR = ${errorLog}`)
        throw new Error('mvn clean test-compile with maven JAR failed')
    }
    getLogger().info(
        `CodeTransformation: mvn clean test-compile with maven JAR succeeded; dependencies copied to ${dependenciesFolderPath}`
    )
}

export async function prepareProjectDependencies(dependenciesFolderPath: string, workingDirPath: string) {
    setMaven()
    // pause to give chat time to update
    await sleep(100)
    try {
        collectDependenciesAndMetadata(dependenciesFolderPath, workingDirPath)
    } catch (err) {
        getLogger().error('CodeTransformation: collectDependenciesAndMetadata failed')
        void vscode.window.showErrorMessage(CodeWhispererConstants.cleanTestCompileErrorNotification)
        throw err
    }
    throwIfCancelled()
    void vscode.window.showInformationMessage(CodeWhispererConstants.buildSucceededNotification)
}

export function runMavenDependencyUpdateCommands(dependenciesFolder: FolderInfo) {
    const baseCommand = transformByQState.getMavenName()

    const args = [
        'versions:dependency-updates-aggregate-report',
        `-DoutputDirectory=${dependenciesFolder.path}`,
        '-DonlyProjectDependencies=true',
        '-DdependencyUpdatesReportFormats=xml',
    ]

    let environment = process.env

    if (transformByQState.getSourceJavaHome()) {
        environment = { ...process.env, JAVA_HOME: transformByQState.getSourceJavaHome() }
    }

    const spawnResult = spawnSync(baseCommand, args, {
        // default behavior is looks for pom.xml in this root
        cwd: dependenciesFolder.path,
        shell: true,
        encoding: 'utf-8',
        env: environment,
        maxBuffer: CodeWhispererConstants.maxBufferSize,
    })

    if (spawnResult.status !== 0) {
        throw new Error(spawnResult.stderr)
    } else {
        return spawnResult.stdout
    }
}
