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
import { CodeTransformPreValidationError, telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import { codeTransformTelemetryState } from '../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency } from '../../amazonqGumby/telemetry/codeTransformTelemetry'
import { TransformByQJavaProjectNotFound } from '../../amazonqGumby/models/model'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'

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

export async function getOpenProjects() {
    const folders = vscode.workspace.workspaceFolders
    if (folders === undefined) {
        vscode.window.showErrorMessage(CodeWhispererConstants.noSupportedJavaProjectsFoundMessage, { modal: true })
        throw new ToolkitError('No Java projects found since no projects are open', { code: 'NoOpenProjects' })
    }
    const openProjects: vscode.QuickPickItem[] = []
    for (const folder of folders) {
        openProjects.push({
            label: folder.name,
            description: folder.uri.fsPath,
        })
    }
    return openProjects
}

/*
 * This function searches for a .class file in the selected project. Then it runs javap on the found .class file to get the JDK version
 * for the project, and sets the version in the state variable. Only JDK8 and JDK11 are supported. It also ensure a pom.xml file is found,
 * since only the Maven build system is supported for now.
 */
export async function validateProjectSelection(project: vscode.QuickPickItem) {
    const projectPath = project.description
    const compiledJavaFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath!, '**/*.class'),
        '**/node_modules/**',
        1
    )
    if (compiledJavaFiles.length < 1) {
        vscode.window.showErrorMessage(CodeWhispererConstants.noSupportedJavaProjectsFoundMessage, { modal: true })
        telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformPreValidationError: 'No Java project found' as CodeTransformPreValidationError,
            result: MetadataResult.Fail,
        })
        throw new TransformByQJavaProjectNotFound()
    }
    const classFilePath = compiledJavaFiles[0].fsPath
    const baseCommand = 'javap'
    const args = ['-v', classFilePath]
    const spawnResult = spawnSync(baseCommand, args, { shell: false, encoding: 'utf-8' })

    if (spawnResult.error || spawnResult.status !== 0) {
        vscode.window.showErrorMessage(CodeWhispererConstants.noSupportedJavaProjectsFoundMessage, { modal: true })
        telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformPreValidationError: 'No Java project found' as CodeTransformPreValidationError,
            result: MetadataResult.Fail,
        })
        throw new ToolkitError('Unable to determine Java version', {
            code: 'CannotDetermineJavaVersion',
            cause: spawnResult.error,
        })
    }
    const majorVersionIndex = spawnResult.stdout.indexOf('major version: ')
    const javaVersion = spawnResult.stdout.slice(majorVersionIndex + 15, majorVersionIndex + 17).trim()
    if (javaVersion === CodeWhispererConstants.JDK8VersionNumber) {
        transformByQState.setSourceJDKVersionToJDK8()
    } else if (javaVersion === CodeWhispererConstants.JDK11VersionNumber) {
        transformByQState.setSourceJDKVersionToJDK11()
    } else {
        vscode.window.showErrorMessage(CodeWhispererConstants.noSupportedJavaProjectsFoundMessage, { modal: true })
        telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformPreValidationError:
                'Project selected is not Java 8 or Java 11' as CodeTransformPreValidationError,
            result: MetadataResult.Fail,
            reason: javaVersion,
        })
        throw new ToolkitError('Project selected is not Java 8 or Java 11', { code: 'UnsupportedJavaVersion' })
    }
    const buildFile = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath!, 'pom.xml'), // check for pom.xml in root directory only
        '**/node_modules/**',
        1
    )
    if (buildFile.length < 1) {
        const buildType = await checkIfGradle(projectPath!)
        vscode.window.showErrorMessage(CodeWhispererConstants.noPomXmlFoundMessage, { modal: true })
        telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformPreValidationError: 'Only Maven projects supported' as CodeTransformPreValidationError,
            result: MetadataResult.Fail,
            reason: buildType,
        })
        throw new ToolkitError('No valid Maven build file found', { code: 'CouldNotFindPomXml' })
    }
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
    try {
        const apiStartTime = Date.now()
        const response = await fetch('PUT', resp.uploadUrl, { body: fs.readFileSync(fileName), headers: headersObj })
            .response
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'UploadZip',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformUploadId: resp.uploadId,
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            // TODO: A nice to have would be getting the zipUploadSize
            codeTransformTotalByteSize: 0,
        })
        getLogger().info(`Status from S3 Upload = ${response.status}`)
    } catch (e: any) {
        const errorMessage = e?.message || 'Error in S3 UploadZip API call'
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'UploadZip',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e?.requestId,
        })
        // Pass along error to callee function
        throw new ToolkitError(errorMessage, { cause: e as Error })
    }
}

export async function stopJob(jobId: string) {
    if (jobId !== '') {
        try {
            const apiStartTime = Date.now()
            const response = await codeWhisperer.codeWhispererClient.codeModernizerStopCodeTransformation({
                transformationJobId: jobId,
            })
            if (response !== undefined) {
                telemetry.codeTransform_logApiLatency.emit({
                    codeTransformApiNames: 'StopTransformation',
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: jobId,
                    codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
                    codeTransformRequestId: response.$response.requestId,
                })
            }
        } catch (e: any) {
            const errorMessage = 'Error stopping job'
            getLogger().error(errorMessage)
            telemetry.codeTransform_logApiError.emit({
                codeTransformApiNames: 'StopTransformation',
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: jobId,
                codeTransformApiErrorMessage: e?.message || errorMessage,
                codeTransformRequestId: e?.requestId,
            })
            throw new ToolkitError(errorMessage, { cause: e as Error })
        }
    }
}

export async function uploadPayload(payloadFileName: string) {
    const sha256 = getSha256(payloadFileName)
    await sleep(2000) // pause to give time to recognize potential cancellation
    throwIfCancelled()
    try {
        const apiStartTime = Date.now()
        const response = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
        })
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'CreateUploadUrl',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformUploadId: response.uploadId,
            codeTransformRequestId: response.$response.requestId,
        })
        await uploadArtifactToS3(payloadFileName, response)
        return response.uploadId
    } catch (e: any) {
        const errorMessage = e?.message || 'Error in CreateUploadUrl API call'
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'CreateUploadUrl',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e?.requestId,
        })
        // Pass along error to callee function
        throw new ToolkitError(errorMessage, { cause: e as Error })
    }
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
    const zipStartTime = Date.now()
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
    if (!mavenFailed && fs.existsSync(dependencyFolderPath)) {
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

    telemetry.codeTransform_jobCreateZipEndTime.emit({
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        // TODO: A nice to have would be getting the zipUploadSize
        codeTransformTotalByteSize: 0,
        codeTransformRunTimeLatency: calculateTotalLatency(zipStartTime),
    })
    return tempFilePath
}

export async function startJob(uploadId: string) {
    const sourceLanguageVersion = `JAVA_${transformByQState.getSourceJDKVersion()}`
    const targetLanguageVersion = `JAVA_${transformByQState.getTargetJDKVersion()}`
    try {
        const apiStartTime = Date.now()
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
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'StartTransformation',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformJobId: response.transformationJobId,
            codeTransformRequestId: response.$response.requestId,
        })
        return response.transformationJobId
    } catch (e: any) {
        const errorMessage = e?.message || 'Error in StartTransformation API call'
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'StartTransformation',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e?.requestId,
        })
        // Pass along error to callee function
        throw new ToolkitError(errorMessage, { cause: e as Error })
    }
}

export function getImageAsBase64(filePath: string) {
    const fileContents = fs.readFileSync(filePath, { encoding: 'base64' })
    return `data:image/svg+xml;base64,${fileContents}`
}

export async function getTransformationPlan(jobId: string) {
    try {
        const apiStartTime = Date.now()
        const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
            transformationJobId: jobId,
        })
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformRequestId: response.$response.requestId,
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
    } catch (e: any) {
        const errorMessage = e?.message || 'Error in GetTransformationPlan API call'
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e?.requestId,
        })
        // Pass along error to callee function
        throw new ToolkitError(errorMessage, { cause: e as Error })
    }
}

export async function getTransformationSteps(jobId: string) {
    try {
        await sleep(2000) // prevent ThrottlingException
        const apiStartTime = Date.now()
        const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
            transformationJobId: jobId,
        })
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformRequestId: response.$response.requestId,
        })
        return response.transformationPlan.transformationSteps
    } catch (e: any) {
        const errorMessage = e?.message || 'Error in GetTransformationPlan API call'
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e?.requestId,
        })
        throw e
    }
}

export async function pollTransformationJob(jobId: string, validStates: string[]) {
    let status: string = ''
    let timer: number = 0
    while (true) {
        throwIfCancelled()
        try {
            const apiStartTime = Date.now()
            const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformation({
                transformationJobId: jobId,
            })
            telemetry.codeTransform_logApiLatency.emit({
                codeTransformApiNames: 'GetTransformation',
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: jobId,
                codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
                codeTransformRequestId: response.$response.requestId,
            })
            status = response.transformationJob.status!
            if (response.transformationJob.reason) {
                transformByQState.setJobFailureReason(response.transformationJob.reason)
            }
            // Conditional check to verify when state changes during polling and log
            // these state changes during transformation
            if (status !== transformByQState.getPolledJobStatus()) {
                telemetry.codeTransform_jobStatusChanged.emit({
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: jobId,
                    codeTransformStatus: status,
                })
            }
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
        } catch (e: any) {
            const errorMessage = e?.message || 'Error in GetTransformation API call'
            telemetry.codeTransform_logApiError.emit({
                codeTransformApiNames: 'GetTransformation',
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: jobId,
                codeTransformApiErrorMessage: errorMessage,
                codeTransformRequestId: e?.requestId,
            })
            // Pass along error to callee function
            throw new ToolkitError(errorMessage, { cause: e as Error })
        }
    }
    return status
}

async function checkIfGradle(projectPath: string) {
    const gradleBuildFile = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, '**/build.gradle'),
        '**/node_modules/**',
        1
    )

    if (gradleBuildFile.length > 0) {
        return 'Gradle'
    } else {
        return 'Unknown'
    }
}
