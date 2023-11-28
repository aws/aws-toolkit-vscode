/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { transformByQState, TransformByQStoppedError, ZipManifest } from '../models/model'
import * as codeWhisperer from '../client/codewhisperer'
import * as crypto from 'crypto'
import { getLogger } from '../../shared/logger'
import { CreateUploadUrlResponse } from '../client/codewhispereruserclient'
import { sleep } from '../../shared/utilities/timeoutUtils'
import * as CodeWhispererConstants from '../models/constants'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import * as vscode from 'vscode'
import { spawnSync } from 'child_process'
import AdmZip from 'adm-zip'
import fetch from '../../common/request'
import globals from '../../shared/extensionGlobals'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'

/* TODO: once supported in all browsers and past "experimental" mode, use Intl DurationFormat:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DurationFormat#browser_compatibility
 * Current functionality: given number of milliseconds elapsed (ex. 4,500,000) return hr / min / sec it represents (ex. 1 hr 15 min)
 */
export function convertToTimeString(durationInMs: number) {
    const duration = durationInMs / CodeWhispererConstants.numMillisecondsPerSecond // convert to seconds
    if (duration < 60) {
        const numSeconds = Math.floor(duration)
        return `${numSeconds} sec`
    } else if (duration < 3600) {
        const numMinutes = Math.floor(duration / 60)
        const numSeconds = Math.floor(duration % 60)
        return `${numMinutes} min ${numSeconds} sec`
    } else {
        const numHours = Math.floor(duration / 3600)
        const numMinutes = Math.floor((duration % 3600) / 60)
        return `${numHours} hr ${numMinutes} min`
    }
}

export function convertDateToTimestamp(date: Date) {
    return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function throwIfCancelled() {
    if (transformByQState.isCancelled()) {
        throw new TransformByQStoppedError()
    }
}

/*
 * This function searches for a .class file in each opened module. Then it runs javap on the found .class file to get the JDK version
 * for the file, and sets the version in the state variable. Only JDK8 and JDK11 are supported.
 */
export async function getValidModules() {
    const folders = vscode.workspace.workspaceFolders
    const validModules: vscode.QuickPickItem[] = []
    if (folders === undefined) {
        vscode.window.showErrorMessage(CodeWhispererConstants.noSupportedJavaProjectsFoundMessage, { modal: true })
        throw Error('No Java projects found since no projects are open')
    }
    let containsSupportedJava = false // workspace must contain Java 8 or Java 11 code for this to be true
    let containsPomXml = false // workspace must contain a 'pom.xml' file for this to be true
    let failureReason = 'NoJavaProjectsAvailable'
    for (const folder of folders) {
        const compiledJavaFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(folder, '**/*.class'),
            '**/node_modules/**',
            1
        )
        if (compiledJavaFiles.length < 1) {
            continue
        }
        const classFilePath = compiledJavaFiles[0].fsPath
        const baseCommand = 'javap'
        const args = ['-v', classFilePath]
        const spawnResult = spawnSync(baseCommand, args, { shell: false, encoding: 'utf-8' })

        if (spawnResult.error || spawnResult.status !== 0) {
            failureReason = 'CouldNotRunJavaCommand'
            continue // if cannot get Java version, move on to other projects in workspace
        }
        const majorVersionIndex = spawnResult.stdout.indexOf('major version: ')
        const javaVersion = spawnResult.stdout.slice(majorVersionIndex + 15, majorVersionIndex + 17).trim()
        if (javaVersion === CodeWhispererConstants.JDK8VersionNumber) {
            transformByQState.setSourceJDKVersionToJDK8()
            containsSupportedJava = true
        } else if (javaVersion === CodeWhispererConstants.JDK11VersionNumber) {
            transformByQState.setSourceJDKVersionToJDK11()
            containsSupportedJava = true
        } else {
            continue
        }
        const buildFile = await vscode.workspace.findFiles(
            new vscode.RelativePattern(folder, '**/pom.xml'), // only supporting projects with a pom.xml for now
            '**/node_modules/**',
            1
        )
        if (buildFile.length < 1) {
            checkIfGradle(folder)
            continue
        } else {
            containsPomXml = true
        }
        validModules.push({ label: folder.name, description: folder.uri.fsPath })
    }
    if (!containsSupportedJava) {
        vscode.window.showErrorMessage(CodeWhispererConstants.noSupportedJavaProjectsFoundMessage, { modal: true })
        throw new ToolkitError('No Java projects found', { code: failureReason })
    }
    if (!containsPomXml) {
        vscode.window.showErrorMessage(CodeWhispererConstants.noPomXmlFoundMessage, { modal: true })
        throw new ToolkitError('No build file found', { code: 'CouldNotFindPomXml' })
    } else {
        telemetry.amazonq_codeTransformInvoke.record({
            codeTransform_ProjectType: 'maven',
        })
    }
    return validModules
}

export function getSha256(fileName: string) {
    const hasher = crypto.createHash('sha256')
    hasher.update(fs.readFileSync(fileName))
    return hasher.digest('base64')
}

// TODO: later, consider enhancing the S3 client to include this functionality
export async function uploadArtifactToS3(fileName: string, resp: CreateUploadUrlResponse) {
    const sha256 = getSha256(fileName)

    let headersObj = {}
    if (resp.kmsKeyArn === undefined || resp.kmsKeyArn.length === 0) {
        headersObj = {
            'x-amz-checksum-sha256': sha256,
            'Content-Type': 'application/zip',
        }
    } else {
        headersObj = {
            'x-amz-checksum-sha256': sha256,
            'Content-Type': 'application/zip',
            'x-amz-server-side-encryption': 'aws:kms',
            'x-amz-server-side-encryption-aws-kms-key-id': resp.kmsKeyArn,
        }
    }

    await sleep(2000) // pause to give time to recognize potential cancellation
    throwIfCancelled()

    const response = await fetch('PUT', resp.uploadUrl, { body: fs.readFileSync(fileName), headers: headersObj })
        .response
    getLogger().info(`Status from S3 Upload = ${response.status}`)
}

export async function stopJob(jobId: string) {
    if (jobId !== '') {
        try {
            await codeWhisperer.codeWhispererClient.codeModernizerStopCodeTransformation({
                transformationJobId: jobId,
            })
        } catch (err) {
            const errorMessage = 'Error stopping job'
            telemetry.amazonq_codeTransformInvoke.record({
                codeTransform_ApiName: 'StopTransformation',
            })
            getLogger().error(errorMessage)
            throw new ToolkitError(errorMessage, { cause: err as Error })
        }
    }
}

export async function uploadPayload(payloadFileName: string) {
    const sha256 = getSha256(payloadFileName)
    await sleep(2000) // pause to give time to recognize potential cancellation
    throwIfCancelled()
    const response = await codeWhisperer.codeWhispererClient.createUploadUrl({
        contentChecksum: sha256,
        contentChecksumType: CodeWhispererConstants.contentChecksumType,
        uploadIntent: CodeWhispererConstants.uploadIntent,
    })
    await uploadArtifactToS3(payloadFileName, response)
    return response.uploadId
}

function getFilesRecursively(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const files = entries.flatMap(entry => {
        const res = path.resolve(dir, entry.name)
        // exclude 'target' directory from ZIP due to issues in backend
        if (entry.isDirectory()) {
            if (entry.name !== 'target') {
                return getFilesRecursively(res)
            } else {
                return []
            }
        } else {
            return [res]
        }
    })
    return files
}

function getProjectDependencies(modulePath: string): string[] {
    // Make temp directory
    const folderName = `${CodeWhispererConstants.dependencyFolderName}${Date.now()}`
    const folderPath = path.join(os.tmpdir(), folderName)

    const baseCommand = 'mvn'
    const args = [
        'dependency:copy-dependencies',
        '-DoutputDirectory=' + folderPath,
        '-Dmdep.useRepositoryLayout=true',
        '-Dmdep.copyPom=true',
        '-Dmdep.addParentPoms=true',
    ]
    const spawnResult = spawnSync(baseCommand, args, { cwd: modulePath, shell: false, encoding: 'utf-8' })

    if (spawnResult.error || spawnResult.status !== 0) {
        vscode.window.showErrorMessage(CodeWhispererConstants.dependencyErrorMessage, { modal: true })
        getLogger().error('Error in running Maven command:')
        // Maven command can still go through and still return an error. Won't be caught in spawnResult.error in this case
        if (spawnResult.error) {
            getLogger().error(spawnResult.error)
        } else {
            getLogger().error(spawnResult.stdout)
        }
        throw new ToolkitError('Maven Dependency Error', { code: 'CannotRunMavenShellCommand' })
    }

    return [folderPath, folderName]
}

export async function zipCode(modulePath: string) {
    await sleep(2000) // pause to give time to recognize potential cancellation
    throwIfCancelled()

    const sourceFolder = modulePath
    const sourceFiles = getFilesRecursively(sourceFolder)

    await sleep(2000) // pause to give time to recognize potential cancellation
    throwIfCancelled()

    let dependencyFolderInfo: string[] = []
    let mavenFailed = false
    try {
        dependencyFolderInfo = getProjectDependencies(modulePath)
    } catch (err) {
        mavenFailed = true
    }

    const dependencyFolderPath = !mavenFailed ? dependencyFolderInfo[0] : ''
    const dependencyFolderName = !mavenFailed ? dependencyFolderInfo[1] : ''

    await sleep(2000) // pause to give time to recognize potential cancellation
    throwIfCancelled()

    const zip = new AdmZip()
    const zipManifest = new ZipManifest()

    for (const file of sourceFiles) {
        const relativePath = path.relative(sourceFolder, file)
        const paddedPath = path.join('sources', relativePath)
        zip.addLocalFile(file, path.dirname(paddedPath))
    }

    await sleep(2000) // pause to give time to recognize potential cancellation
    throwIfCancelled()

    let dependencyFiles: string[] = []
    if (!mavenFailed) {
        dependencyFiles = getFilesRecursively(dependencyFolderPath)
    }

    if (!mavenFailed && dependencyFiles.length > 0) {
        for (const file of dependencyFiles) {
            const relativePath = path.relative(dependencyFolderPath, file)
            const paddedPath = path.join(`dependencies/${dependencyFolderName}`, relativePath)
            zip.addLocalFile(file, path.dirname(paddedPath))
        }
        zipManifest.dependenciesRoot += `${dependencyFolderName}/`
    } else {
        zipManifest.dependenciesRoot = undefined
    }
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(zipManifest), 'utf-8'))

    await sleep(2000) // pause to give time to recognize potential cancellation
    throwIfCancelled()

    const tempFilePath = path.join(os.tmpdir(), 'zipped-code.zip')
    fs.writeFileSync(tempFilePath, zip.toBuffer())
    if (!mavenFailed) {
        fs.rmSync(dependencyFolderPath, { recursive: true, force: true })
    }
    return tempFilePath
}

export async function startJob(uploadId: string) {
    const sourceLanguageVersion = `JAVA_${transformByQState.getSourceJDKVersion()}`
    const targetLanguageVersion = `JAVA_${transformByQState.getTargetJDKVersion()}`
    const response = await codeWhisperer.codeWhispererClient.codeModernizerStartCodeTransformation({
        workspaceState: {
            uploadId: uploadId,
            programmingLanguage: { languageName: CodeWhispererConstants.defaultLanguage.toLowerCase() },
        },
        transformationSpec: {
            transformationType: CodeWhispererConstants.transformationType,
            source: { language: sourceLanguageVersion },
            target: { language: targetLanguageVersion },
        },
    })
    return response.transformationJobId
}

export function getImageAsBase64(filePath: string) {
    const fileContents = fs.readFileSync(filePath, { encoding: 'base64' })
    return `data:image/svg+xml;base64,${fileContents}`
}

export async function getTransformationPlan(jobId: string) {
    const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
        transformationJobId: jobId,
    })
    const logoAbsolutePath = globals.context.asAbsolutePath(
        path.join('resources', 'icons', 'aws', 'amazonq', 'transform-landing-page-icon.svg')
    )
    const logoBase64 = getImageAsBase64(logoAbsolutePath)
    let plan = `![Transform by Q](${logoBase64}) \n # Code Transformation Plan by Amazon Q \n\n`
    plan += CodeWhispererConstants.planIntroductionMessage.replace(
        'JAVA_VERSION_HERE',
        transformByQState.getSourceJDKVersion()
    )
    plan += `\n\nExpected total transformation steps: ${response.transformationPlan.transformationSteps.length}\n\n`
    plan += CodeWhispererConstants.planDisclaimerMessage
    for (const step of response.transformationPlan.transformationSteps) {
        plan += `**${step.name}**\n\n- ${step.description}\n\n\n`
    }

    return plan
}

export async function getTransformationSteps(jobId: string) {
    await sleep(2000) // prevent ThrottlingException
    const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
        transformationJobId: jobId,
    })
    return response.transformationPlan.transformationSteps
}

export async function pollTransformationJob(jobId: string, validStates: string[]) {
    let status: string = ''
    let timer: number = 0
    while (true) {
        throwIfCancelled()
        const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformation({
            transformationJobId: jobId,
        })
        if (response.transformationJob.reason) {
            transformByQState.setJobFailureReason(response.transformationJob.reason)
        }
        status = response.transformationJob.status!
        transformByQState.setPolledJobStatus(status)
        await vscode.commands.executeCommand('aws.amazonq.refresh')
        if (validStates.includes(status)) {
            break
        }
        if (CodeWhispererConstants.failureStates.includes(status)) {
            throw new Error('Job failed, not going to retrieve plan')
        }
        await sleep(CodeWhispererConstants.transformationJobPollingIntervalSeconds * 1000)
        timer += CodeWhispererConstants.transformationJobPollingIntervalSeconds
        if (timer > CodeWhispererConstants.transformationJobTimeoutSeconds) {
            throw new Error('Transform by Q timed out')
        }
    }
    return status
}

async function checkIfGradle(folder: vscode.WorkspaceFolder) {
    const gradleBuildFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/build.gradle'),
        '**/node_modules/**',
        1
    )

    if (gradleBuildFiles.length > 1) {
        telemetry.amazonq_codeTransformInvoke.record({
            codeTransform_ProjectType: 'gradle',
        })
    } else {
        telemetry.amazonq_codeTransformInvoke.record({
            codeTransform_ProjectType: 'unknown',
        })
    }
}
