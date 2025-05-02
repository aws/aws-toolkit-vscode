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
import { CodeTransformBuildCommand, telemetry } from '../../../shared/telemetry/telemetry'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { ToolkitError } from '../../../shared/errors'
import { setMaven } from './transformFileHandler'
import { throwIfCancelled } from './transformApiHandler'
import { sleep } from '../../../shared/utilities/timeoutUtils'

function installProjectDependencies(dependenciesFolder: FolderInfo, modulePath: string) {
    telemetry.codeTransform_localBuildProject.run(() => {
        telemetry.record({ codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId() })

        // will always be 'mvn'
        const baseCommand = transformByQState.getMavenName()

        const args = [`-Dmaven.repo.local=${dependenciesFolder.path}`, 'clean', 'install', '-q']

        transformByQState.appendToBuildLog(`Running ${baseCommand} ${args.join(' ')}`)

        if (transformByQState.getCustomBuildCommand() === CodeWhispererConstants.skipUnitTestsBuildCommand) {
            args.push('-DskipTests')
        }

        let environment = process.env

        if (transformByQState.getSourceJavaHome()) {
            environment = { ...process.env, JAVA_HOME: transformByQState.getSourceJavaHome() }
        }

        const argString = args.join(' ')
        const spawnResult = spawnSync(baseCommand, args, {
            cwd: modulePath,
            shell: true,
            encoding: 'utf-8',
            env: environment,
            maxBuffer: CodeWhispererConstants.maxBufferSize,
        })

        const mavenBuildCommand = transformByQState.getMavenName()
        telemetry.record({ codeTransformBuildCommand: mavenBuildCommand as CodeTransformBuildCommand })

        if (spawnResult.status !== 0) {
            let errorLog = ''
            errorLog += spawnResult.error ? JSON.stringify(spawnResult.error) : ''
            errorLog += `${spawnResult.stderr}\n${spawnResult.stdout}`
            transformByQState.appendToBuildLog(`${baseCommand} ${argString} failed: \n ${errorLog}`)
            getLogger().error(
                `CodeTransformation: Error in running Maven command ${baseCommand} ${argString} = ${errorLog}`
            )
            throw new ToolkitError(`Maven ${argString} error`, { code: 'MavenExecutionError' })
        } else {
            transformByQState.appendToBuildLog(`mvn clean install succeeded`)
        }
    })
}

function copyProjectDependencies(dependenciesFolder: FolderInfo, modulePath: string) {
    const baseCommand = transformByQState.getMavenName()

    const args = [
        'dependency:copy-dependencies',
        `-DoutputDirectory=${dependenciesFolder.path}`,
        '-Dmdep.useRepositoryLayout=true',
        '-Dmdep.copyPom=true',
        '-Dmdep.addParentPoms=true',
        '-q',
    ]

    let environment = process.env
    if (transformByQState.getSourceJavaHome()) {
        environment = { ...process.env, JAVA_HOME: transformByQState.getSourceJavaHome() }
    }

    const spawnResult = spawnSync(baseCommand, args, {
        cwd: modulePath,
        shell: true,
        encoding: 'utf-8',
        env: environment,
        maxBuffer: CodeWhispererConstants.maxBufferSize,
    })
    if (spawnResult.status !== 0) {
        let errorLog = ''
        errorLog += spawnResult.error ? JSON.stringify(spawnResult.error) : ''
        errorLog += `${spawnResult.stderr}\n${spawnResult.stdout}`
        getLogger().info(
            `CodeTransformation: Maven command ${baseCommand} ${args} failed, but still continuing with transformation: ${errorLog}`
        )
        throw new Error('Maven copy-deps error')
    }
}

export async function prepareProjectDependencies(dependenciesFolder: FolderInfo, rootPomPath: string) {
    setMaven()
    getLogger().info('CodeTransformation: running Maven copy-dependencies')
    // pause to give chat time to update
    await sleep(100)
    try {
        copyProjectDependencies(dependenciesFolder, rootPomPath)
    } catch (err) {
        // continue in case of errors
        getLogger().info(
            `CodeTransformation: Maven copy-dependencies failed, but transformation will continue and may succeed`
        )
    }

    getLogger().info('CodeTransformation: running Maven install')
    try {
        installProjectDependencies(dependenciesFolder, rootPomPath)
    } catch (err) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.cleanInstallErrorNotification)
        throw err
    }

    throwIfCancelled()
    void vscode.window.showInformationMessage(CodeWhispererConstants.buildSucceededNotification)
}

export async function getVersionData() {
    const baseCommand = transformByQState.getMavenName()
    const projectPath = transformByQState.getProjectPath()
    const args = ['-v']
    const spawnResult = spawnSync(baseCommand, args, { cwd: projectPath, shell: true, encoding: 'utf-8' })

    let localMavenVersion: string | undefined = ''
    let localJavaVersion: string | undefined = ''

    try {
        const localMavenVersionIndex = spawnResult.stdout.indexOf('Apache Maven')
        const localMavenVersionString = spawnResult.stdout.slice(localMavenVersionIndex + 13).trim()
        localMavenVersion = localMavenVersionString.slice(0, localMavenVersionString.indexOf(' ')).trim()
    } catch (e: any) {
        localMavenVersion = undefined // if this happens here or below, user most likely has JAVA_HOME incorrectly defined
    }

    try {
        const localJavaVersionIndex = spawnResult.stdout.indexOf('Java version: ')
        const localJavaVersionString = spawnResult.stdout.slice(localJavaVersionIndex + 14).trim()
        localJavaVersion = localJavaVersionString.slice(0, localJavaVersionString.indexOf(',')).trim() // will match value of JAVA_HOME
    } catch (e: any) {
        localJavaVersion = undefined
    }

    getLogger().info(
        `CodeTransformation: Ran ${baseCommand} to get Maven version = ${localMavenVersion} and Java version = ${localJavaVersion} with project JDK = ${transformByQState.getSourceJDKVersion()}`
    )
    return [localMavenVersion, localJavaVersion]
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
