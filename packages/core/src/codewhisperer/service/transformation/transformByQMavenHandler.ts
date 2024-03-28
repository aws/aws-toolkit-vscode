/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { BuildSystem, FolderInfo, transformByQState } from '../../models/model'
import { getLogger } from '../../../shared/logger'
import * as CodeWhispererConstants from '../../models/constants'
import { spawnSync } from 'child_process' // Consider using ChildProcess once we finalize all spawnSync calls
import { CodeTransformMavenBuildCommand, telemetry } from '../../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import { ToolkitError } from '../../../shared/errors'
import path from 'path'
import { throwIfCancelled, writeLogs } from './transformByQSharedHandler'
import { existsSync } from 'fs'

// run 'install' with either 'mvnw.cmd', './mvnw', or 'mvn' (if wrapper exists, we use that, otherwise we use regular 'mvn')
function installProjectDependencies(dependenciesFolder: FolderInfo) {
    // baseCommand will be one of: '.\mvnw.cmd', './mvnw', 'mvn'
    const baseCommand = transformByQState.getMavenName()
    const modulePath = transformByQState.getProjectPath()

    transformByQState.appendToErrorLog(`Running command ${baseCommand} clean install`)

    // Note: IntelliJ runs 'clean' separately from 'install'. Evaluate benefits (if any) of this.
    const args = [`-Dmaven.repo.local=${dependenciesFolder.path}`, 'clean', 'install', '-q']
    let environment = process.env

    if (transformByQState.getJavaHome() !== undefined) {
        environment = { ...process.env, JAVA_HOME: transformByQState.getJavaHome() }
    }

    const argString = args.join(' ')
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
        transformByQState.appendToErrorLog(`${baseCommand} ${argString} failed: \n ${errorLog}`)
        getLogger().error(
            `CodeTransformation: Error in running Maven ${argString} command ${baseCommand} = ${errorLog}`
        )
        let errorReason = ''
        if (spawnResult.stdout) {
            errorReason = `Maven ${argString}: InstallationExecutionError`
            /*
             * adding this check here because these mvn commands sometimes generate a lot of output.
             * rarely, a buffer overflow has resulted when these mvn commands are run with -X, -e flags
             * which are not being used here (for now), but still keeping this just in case.
             */
            if (Buffer.byteLength(spawnResult.stdout, 'utf-8') > CodeWhispererConstants.maxBufferSize) {
                errorReason += '-BufferOverflow'
            }
        } else {
            errorReason = `Maven ${argString}: InstallationSpawnError`
        }
        if (spawnResult.error) {
            const errorCode = (spawnResult.error as any).code ?? 'UNKNOWN'
            errorReason += `-${errorCode}`
        }
        let mavenBuildCommand = transformByQState.getMavenName()
        // slashes not allowed in telemetry
        if (mavenBuildCommand === './mvnw') {
            mavenBuildCommand = 'mvnw'
        } else if (mavenBuildCommand === '.\\mvnw.cmd') {
            mavenBuildCommand = 'mvnw.cmd'
        }
        telemetry.codeTransform_mvnBuildFailed.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformMavenBuildCommand: mavenBuildCommand as CodeTransformMavenBuildCommand,
            result: MetadataResult.Fail,
            reason: errorReason,
        })
        throw new ToolkitError(`Maven ${argString} error`, { code: 'MavenExecutionError' })
    } else {
        transformByQState.appendToErrorLog(`${baseCommand} ${argString} succeeded`)
    }
}

function copyProjectDependencies(dependenciesFolder: FolderInfo) {
    // baseCommand will be one of: '.\mvnw.cmd', './mvnw', 'mvn'
    const baseCommand = transformByQState.getMavenName()
    const modulePath = transformByQState.getProjectPath()

    transformByQState.appendToErrorLog(`Running command ${baseCommand} copy-dependencies`)

    const args = [
        'dependency:copy-dependencies',
        `-DoutputDirectory=${dependenciesFolder.path}`,
        '-Dmdep.useRepositoryLayout=true',
        '-Dmdep.copyPom=true',
        '-Dmdep.addParentPoms=true',
        '-q',
    ]
    let environment = process.env
    // if JAVA_HOME not found or not matching project JDK, get user input for it and set here
    if (transformByQState.getJavaHome() !== undefined) {
        environment = { ...process.env, JAVA_HOME: transformByQState.getJavaHome() }
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
        transformByQState.appendToErrorLog(`${baseCommand} copy-dependencies failed: \n ${errorLog}`)
        getLogger().error(
            `CodeTransformation: Error in running Maven copy-dependencies command ${baseCommand} = ${errorLog}`
        )
        let errorReason = ''
        if (spawnResult.stdout) {
            errorReason = 'Maven Copy: CopyDependenciesExecutionError'
            if (Buffer.byteLength(spawnResult.stdout, 'utf-8') > CodeWhispererConstants.maxBufferSize) {
                errorReason += '-BufferOverflow'
            }
        } else {
            errorReason = 'Maven Copy: CopyDependenciesSpawnError'
        }
        if (spawnResult.error) {
            const errorCode = (spawnResult.error as any).code ?? 'UNKNOWN'
            errorReason += `-${errorCode}`
        }
        let mavenBuildCommand = transformByQState.getMavenName()
        // slashes not allowed in telemetry
        if (mavenBuildCommand === './mvnw') {
            mavenBuildCommand = 'mvnw'
        } else if (mavenBuildCommand === '.\\mvnw.cmd') {
            mavenBuildCommand = 'mvnw.cmd'
        }
        telemetry.codeTransform_mvnBuildFailed.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformMavenBuildCommand: mavenBuildCommand as CodeTransformMavenBuildCommand,
            result: MetadataResult.Fail,
            reason: errorReason,
        })
        throw new Error('Maven copy-deps error')
    } else {
        transformByQState.appendToErrorLog(`${baseCommand} copy-dependencies succeeded`)
    }
}

export async function checkBuildSystem(projectPath: string) {
    const mavenBuildFilePath = path.join(projectPath, 'pom.xml')
    if (existsSync(mavenBuildFilePath)) {
        return BuildSystem.Maven
    }
    return BuildSystem.Unknown
}

export async function prepareProjectDependencies(dependenciesFolder: FolderInfo) {
    try {
        copyProjectDependencies(dependenciesFolder)
    } catch (err) {
        // continue in case of errors
    }

    try {
        installProjectDependencies(dependenciesFolder)
    } catch (err) {
        void vscode.window.showErrorMessage(
            CodeWhispererConstants.installErrorMessage.replace(
                'LINK_HERE',
                CodeWhispererConstants.linkToMavenTroubleshooting
            )
        )
        // open build-logs.txt file to show user error logs
        const logFilePath = await writeLogs()
        const doc = await vscode.workspace.openTextDocument(logFilePath)
        await vscode.window.showTextDocument(doc)
        throw err
    }

    throwIfCancelled()
}

export async function getVersionData() {
    const baseCommand = transformByQState.getMavenName() // will be one of: 'mvnw.cmd', './mvnw', 'mvn'
    const modulePath = transformByQState.getProjectPath()
    const args = ['-v']
    const spawnResult = spawnSync(baseCommand, args, { cwd: modulePath, shell: true, encoding: 'utf-8' })

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
