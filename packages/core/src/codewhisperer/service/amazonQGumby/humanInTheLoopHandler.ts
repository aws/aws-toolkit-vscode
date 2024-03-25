/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { FolderInfo } from '../transformByQHandler'
import { transformByQState } from '../../models/model'
import { spawnSync } from 'child_process'

export async function createPomCopy(pomFileVirtualFileReference: vscode.Uri, fileName: string): Promise<vscode.Uri> {
    try {
        const pomFileContents = readFileSync(pomFileVirtualFileReference.fsPath)
        const newlyGeneratedTmpPath = path.join(pomFileVirtualFileReference.fsPath, fileName)
        writeFileSync(newlyGeneratedTmpPath, pomFileContents)
        return vscode.Uri.file(newlyGeneratedTmpPath)
    } catch (err) {
        console.log('Error creating pom copy', err)
        throw err
    }
}
export async function replacePomVersion(pomFileVirtualFileReference: vscode.Uri, manifestFileValues: IManifestFile) {
    const pomFile = await vscode.workspace.openTextDocument(pomFileVirtualFileReference)
    const pomFileText = pomFile.getText()
    const pomFileTextWithNewVersion = pomFileText.replace(
        new RegExp(manifestFileValues.sourcePomVersion, 'g'),
        manifestFileValues.hilType
    )
    const newPomFile = await vscode.workspace.openTextDocument({
        language: 'xml',
        content: pomFileTextWithNewVersion,
    })
    await vscode.window.showTextDocument(newPomFile)
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
}

export interface IManifestFile {
    hilType: string
    pomFolderName: string
    sourcePomVersion: string
}

export async function getJsonValuesFromManifestFile(
    manifestFileVirtualFileReference: vscode.Uri
): Promise<IManifestFile> {
    try {
        const manifestFileContents = readFileSync(manifestFileVirtualFileReference.fsPath)
        const jsonValues = JSON.parse(manifestFileContents.toString())
        return {
            hilType: jsonValues?.hilType,
            pomFolderName: jsonValues?.pomFolderName,
            sourcePomVersion: jsonValues?.sourcePomVersion,
        }
    } catch (err) {
        console.log('Error parsing manifest.json file', err)
        throw err
    }
}

// run 'install' with either 'mvnw.cmd', './mvnw', or 'mvn' (if wrapper exists, we use that, otherwise we use regular 'mvn')
function runMavenDependencyUpdateCommands(modulePath: string) {
    // baseCommand will be one of: '.\mvnw.cmd', './mvnw', 'mvn'
    const baseCommand = transformByQState.getMavenName()

    transformByQState.appendToErrorLog(`Running command ${baseCommand} clean install`)

    // Note: IntelliJ runs 'clean' separately from 'install'. Evaluate benefits (if any) of this.
    const args = [
        `-DonlyProjectDependencies=true -DdependencyUpdatesReportFormats=xml`,
        'versions:dependency-updates-aggregate-report',
    ]
    let environment = process.env
    // if JAVA_HOME not found or not matching project JDK, get user input for it and set here
    if (transformByQState.getJavaHome() !== undefined) {
        environment = { ...process.env, JAVA_HOME: transformByQState.getJavaHome() }
    }

    const argString = args.join(' ')
    const spawnResult = spawnSync(baseCommand, args, {
        cwd: modulePath,
        shell: true,
        encoding: 'utf-8',
        env: environment,
        // maxBuffer: CodeWhispererConstants.maxBufferSize,
    })

    console.log(`Post mvn versions command results ${baseCommand} ${argString}:`, spawnResult)

    // if (spawnResult.status !== 0) {
    //     let errorLog = ''
    //     const errorCode = getMavenErrorCode(args)
    //     errorLog += spawnResult.error ? JSON.stringify(spawnResult.error) : ''
    //     errorLog += `${spawnResult.stderr}\n${spawnResult.stdout}`
    //     transformByQState.appendToErrorLog(`${baseCommand} ${argString} failed: \n ${errorLog}`)
    //     getLogger().error(
    //         `CodeTransformation: Error in running Maven ${argString} command ${baseCommand} = ${errorLog}`
    //     )
    //     let errorReason = ''
    //     if (spawnResult.stdout) {
    //         errorReason = `Maven ${argString}: ${errorCode}ExecutionError`
    //         /*
    //          * adding this check here because these mvn commands sometimes generate a lot of output.
    //          * rarely, a buffer overflow has resulted when these mvn commands are run with -X, -e flags
    //          * which are not being used here (for now), but still keeping this just in case.
    //          */
    //         if (Buffer.byteLength(spawnResult.stdout, 'utf-8') > CodeWhispererConstants.maxBufferSize) {
    //             errorReason += '-BufferOverflow'
    //         }
    //     } else {
    //         errorReason = `Maven ${argString}: ${errorCode}SpawnError`
    //     }
    //     if (spawnResult.error) {
    //         const errorCode = (spawnResult.error as any).code ?? 'UNKNOWN'
    //         errorReason += `-${errorCode}`
    //     }
    //     let mavenBuildCommand = transformByQState.getMavenName()
    //     // slashes not allowed in telemetry
    //     if (mavenBuildCommand === './mvnw') {
    //         mavenBuildCommand = 'mvnw'
    //     } else if (mavenBuildCommand === '.\\mvnw.cmd') {
    //         mavenBuildCommand = 'mvnw.cmd'
    //     }
    //     telemetry.codeTransform_mvnBuildFailed.emit({
    //         codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
    //         codeTransformMavenBuildCommand: mavenBuildCommand as CodeTransformMavenBuildCommand,
    //         result: MetadataResult.Fail,
    //         reason: errorReason,
    //     })
    //     throw new Error('Maven install error')
    // } else {
    //     transformByQState.appendToErrorLog(`${baseCommand} ${argString} succeeded`)
    // }
}
