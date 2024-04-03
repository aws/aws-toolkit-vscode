/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import {
    FolderInfo,
    sessionPlanProgress,
    StepProgress,
    transformByQState,
    TransformByQStoppedError,
    ZipManifest,
} from '../../models/model'
import * as codeWhisperer from '../../client/codewhisperer'
import * as crypto from 'crypto'
import { getLogger } from '../../../shared/logger'
import { CreateUploadUrlResponse } from '../../client/codewhispereruserclient'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import * as CodeWhispererConstants from '../../models/constants'
import AdmZip from 'adm-zip'
import globals from '../../../shared/extensionGlobals'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency } from '../../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import request from '../../../common/request'

import { projectSizeTooLargeMessage } from '../../../amazonqGumby/chat/controller/messenger/stringConstants'
import { ZipExceedsSizeLimitError } from '../../../amazonqGumby/errors'
import { writeLogs } from './transformFileHandler'
import { encodeHTML } from '../../../shared/utilities/textUtilities'

export function getSha256(buffer: Buffer) {
    const hasher = crypto.createHash('sha256')
    hasher.update(buffer)
    return hasher.digest('base64')
}

export function throwIfCancelled() {
    if (transformByQState.isCancelled()) {
        throw new TransformByQStoppedError()
    }
}

export function getHeadersObj(sha256: string, kmsKeyArn: string | undefined) {
    let headersObj = {}
    if (kmsKeyArn === undefined || kmsKeyArn.length === 0) {
        headersObj = {
            'x-amz-checksum-sha256': sha256,
            'Content-Type': 'application/zip',
        }
    } else {
        headersObj = {
            'x-amz-checksum-sha256': sha256,
            'Content-Type': 'application/zip',
            'x-amz-server-side-encryption': 'aws:kms',
            'x-amz-server-side-encryption-aws-kms-key-id': kmsKeyArn,
        }
    }
    return headersObj
}

// Consider enhancing the S3 client to include this functionality
export async function uploadArtifactToS3(
    fileName: string,
    resp: CreateUploadUrlResponse,
    sha256: string,
    buffer: Buffer
) {
    throwIfCancelled()
    try {
        const apiStartTime = Date.now()
        const response = await request.fetch('PUT', resp.uploadUrl, {
            body: buffer,
            headers: getHeadersObj(sha256, resp.kmsKeyArn),
        }).response
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'UploadZip',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformUploadId: resp.uploadId,
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformTotalByteSize: (await fs.promises.stat(fileName)).size,
            result: MetadataResult.Pass,
        })
        getLogger().info(`CodeTransformation: Status from S3 Upload = ${response.status}`)
    } catch (e: any) {
        const errorMessage = (e as Error).message ?? 'Error in S3 UploadZip API call'
        getLogger().error(`CodeTransformation: UploadZip error = ${errorMessage}`)
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'UploadZip',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e.requestId ?? '',
            result: MetadataResult.Fail,
            reason: 'UploadToS3Failed',
        })
        throw new Error('Upload PUT request failed')
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
                    result: MetadataResult.Pass,
                })
                // always store request ID, but it will only show up in a notification if an error occurs
                if (response.$response.requestId) {
                    transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
                }
            }
        } catch (e: any) {
            const errorMessage = (e as Error).message ?? 'Error stopping job'
            getLogger().error(`CodeTransformation: StopTransformation error = ${errorMessage}`)
            telemetry.codeTransform_logApiError.emit({
                codeTransformApiNames: 'StopTransformation',
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: jobId,
                codeTransformApiErrorMessage: errorMessage,
                codeTransformRequestId: e.requestId ?? '',
                result: MetadataResult.Fail,
                reason: 'StopTransformationFailed',
            })
            throw new Error('Stop job failed')
        }
    }
}

export async function uploadPayload(payloadFileName: string) {
    const buffer = fs.readFileSync(payloadFileName)
    const sha256 = getSha256(buffer)

    throwIfCancelled()
    let response = undefined
    try {
        const apiStartTime = Date.now()
        response = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
        })
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'CreateUploadUrl',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformUploadId: response.uploadId,
            codeTransformRequestId: response.$response.requestId,
            result: MetadataResult.Pass,
        })
    } catch (e: any) {
        const errorMessage = (e as Error).message ?? 'Error in CreateUploadUrl API call'
        getLogger().error(`CodeTransformation: CreateUploadUrl error: = ${errorMessage}`)
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'CreateUploadUrl',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e.requestId ?? '',
            result: MetadataResult.Fail,
            reason: 'CreateUploadUrlFailed',
        })
        throw new Error('Create upload URL failed')
    }
    try {
        await uploadArtifactToS3(payloadFileName, response, sha256, buffer)
    } catch (e: any) {
        const errorMessage = (e as Error).message ?? 'Error in uploadArtifactToS3 call'
        getLogger().error(`CodeTransformation: UploadArtifactToS3 error: = ${errorMessage}`)
        throw new Error('S3 upload failed')
    }
    return response.uploadId
}

/**
 * Gets all files in dir. We use this method to get the source code, then we run a mvn command to
 * copy over dependencies into their own folder, then we use this method again to get those
 * dependencies. If isDependenciesFolder is true, then we are getting all the files
 * of the dependencies which were copied over by the previously-run mvn command, in which case
 * we DO want to include any dependencies that may happen to be named "target", hence the check
 * in the first part of the IF statement. The point of excluding folders named target is that
 * "target" is also the name of the folder where .class files, large JARs, etc. are stored after
 * building, and we do not want these included in the ZIP so we exclude these when calling
 * getFilesRecursively on the source code folder.
 */
function getFilesRecursively(dir: string, isDependenciesFolder: boolean): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const files = entries.flatMap(entry => {
        const res = path.resolve(dir, entry.name)
        // exclude 'target' directory from ZIP (except if zipping dependencies) due to issues in backend
        if (entry.isDirectory()) {
            if (isDependenciesFolder || entry.name !== 'target') {
                return getFilesRecursively(res, isDependenciesFolder)
            } else {
                return []
            }
        } else {
            return [res]
        }
    })
    return files
}

export async function zipCode(dependenciesFolder: FolderInfo) {
    const modulePath = transformByQState.getProjectPath()
    throwIfCancelled()
    const zipStartTime = Date.now()
    const sourceFolder = modulePath
    const sourceFiles = getFilesRecursively(sourceFolder, false)

    const zip = new AdmZip()
    const zipManifest = new ZipManifest()

    for (const file of sourceFiles) {
        const relativePath = path.relative(sourceFolder, file)
        const paddedPath = path.join('sources', relativePath)
        zip.addLocalFile(file, path.dirname(paddedPath))
    }

    throwIfCancelled()

    let dependencyFiles: string[] = []
    if (fs.existsSync(dependenciesFolder.path)) {
        dependencyFiles = getFilesRecursively(dependenciesFolder.path, true)
    }

    if (dependencyFiles.length > 0) {
        for (const file of dependencyFiles) {
            const relativePath = path.relative(dependenciesFolder.path, file)
            const paddedPath = path.join(`dependencies/${dependenciesFolder.name}`, relativePath)
            zip.addLocalFile(file, path.dirname(paddedPath))
        }
        zipManifest.dependenciesRoot += `${dependenciesFolder.name}/`
        telemetry.codeTransform_dependenciesCopied.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
    } else {
        zipManifest.dependenciesRoot = undefined
    }

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(zipManifest)), 'utf-8')

    throwIfCancelled()

    // add text file with logs from mvn clean install and mvn copy-dependencies
    const logFilePath = await writeLogs()
    zip.addLocalFile(logFilePath)

    const tempFilePath = path.join(os.tmpdir(), 'zipped-code.zip')
    fs.writeFileSync(tempFilePath, zip.toBuffer())
    if (fs.existsSync(dependenciesFolder.path)) {
        fs.rmSync(dependenciesFolder.path, { recursive: true, force: true })
    }
    fs.rmSync(logFilePath) // will always exist here

    const zipSize = (await fs.promises.stat(tempFilePath)).size

    const exceedsLimit = zipSize > CodeWhispererConstants.uploadZipSizeLimitInBytes

    // Later, consider adding field for number of source lines of code
    telemetry.codeTransform_jobCreateZipEndTime.emit({
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        codeTransformTotalByteSize: zipSize,
        codeTransformRunTimeLatency: calculateTotalLatency(zipStartTime),
        result: exceedsLimit ? MetadataResult.Fail : MetadataResult.Pass,
    })

    if (exceedsLimit) {
        void vscode.window.showErrorMessage(
            projectSizeTooLargeMessage.replace('LINK_HERE', CodeWhispererConstants.linkToUploadZipTooLarge)
        )
        throw new ZipExceedsSizeLimitError()
    }

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
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'StartTransformation',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformJobId: response.transformationJobId,
            codeTransformRequestId: response.$response.requestId,
            result: MetadataResult.Pass,
        })
        return response.transformationJobId
    } catch (e: any) {
        const errorMessage = (e as Error).message ?? 'Error in StartTransformation API call'
        getLogger().error(`CodeTransformation: StartTransformation error = ${errorMessage}`)
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'StartTransformation',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e.requestId ?? '',
            result: MetadataResult.Fail,
            reason: 'StartTransformationFailed',
        })
        throw new Error('Start job failed')
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
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformRequestId: response.$response.requestId,
            result: MetadataResult.Pass,
        })
        const logoAbsolutePath = globals.context.asAbsolutePath(
            path.join('resources', 'icons', 'aws', 'amazonq', 'transform-landing-page-icon.svg')
        )
        const logoBase64 = getImageAsBase64(logoAbsolutePath)
        let plan = `![Amazon Q Code Transformation](${logoBase64}) \n # Code Transformation Plan by Amazon Q \n\n`
        plan += CodeWhispererConstants.planIntroductionMessage.replace(
            'JAVA_VERSION_HERE',
            transformByQState.getSourceJDKVersion()!
        )
        plan += `\n\nExpected total transformation steps: ${response.transformationPlan.transformationSteps.length}\n\n`
        plan += CodeWhispererConstants.planDisclaimerMessage
        for (const step of response.transformationPlan.transformationSteps) {
            plan += `**${step.name}**\n\n- ${step.description}\n\n\n`
        }

        return plan
    } catch (e: any) {
        const errorMessage = (e as Error).message ?? 'Error in GetTransformationPlan API call'
        getLogger().error(`CodeTransformation: GetTransformationPlan error = ${errorMessage}`)
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e.requestId ?? '',
            result: MetadataResult.Fail,
            reason: 'GetTransformationPlanFailed',
        })
        throw new Error('Get plan failed')
    }
}

export async function getTransformationSteps(jobId: string) {
    try {
        await sleep(2000) // prevent ThrottlingException
        const apiStartTime = Date.now()
        const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
            transformationJobId: jobId,
        })
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformRequestId: response.$response.requestId,
            result: MetadataResult.Pass,
        })
        return response.transformationPlan.transformationSteps
    } catch (e: any) {
        const errorMessage = (e as Error).message ?? 'Error in GetTransformationPlan API call'
        getLogger().error(`CodeTransformation: GetTransformationPlan error = ${errorMessage}`)
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e.requestId ?? '',
            result: MetadataResult.Fail,
            reason: 'GetTransformationPlanFailed',
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
                result: MetadataResult.Pass,
            })
            status = response.transformationJob.status!
            // must be series of ifs, not else ifs
            if (CodeWhispererConstants.validStatesForJobStarted.includes(status)) {
                sessionPlanProgress['startJob'] = StepProgress.Succeeded
            }
            if (CodeWhispererConstants.validStatesForBuildSucceeded.includes(status)) {
                sessionPlanProgress['buildCode'] = StepProgress.Succeeded
            }
            if (CodeWhispererConstants.validStatesForPlanGenerated.includes(status)) {
                sessionPlanProgress['generatePlan'] = StepProgress.Succeeded
            }
            // emit metric when job status changes
            if (status !== transformByQState.getPolledJobStatus()) {
                telemetry.codeTransform_jobStatusChanged.emit({
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: jobId,
                    codeTransformStatus: status,
                    result: MetadataResult.Pass,
                    codeTransformPreviousStatus: transformByQState.getPolledJobStatus(),
                })
            }
            transformByQState.setPolledJobStatus(status)
            await vscode.commands.executeCommand('aws.amazonq.refresh')
            if (validStates.includes(status)) {
                break
            }
            /*
             * Below IF is only relevant for pollTransformationStatusUntilPlanReady, when pollTransformationStatusUntilComplete
             * is called, we break above on validStatesForCheckingDownloadUrl and check final status in finalizeTransformationJob
             */
            if (CodeWhispererConstants.failureStates.includes(status)) {
                transformByQState.setJobFailureMetadata(
                    `${response.transformationJob.reason} (request ID: ${response.$response.requestId})`
                )
                throw new Error('Job was rejected, stopped, or failed')
            }
            await sleep(CodeWhispererConstants.transformationJobPollingIntervalSeconds * 1000)
            timer += CodeWhispererConstants.transformationJobPollingIntervalSeconds
            if (timer > CodeWhispererConstants.transformationJobTimeoutSeconds) {
                throw new Error('Job timed out')
            }
        } catch (e: any) {
            const errorMessage = (e as Error).message ?? 'Error in GetTransformation API call'
            getLogger().error(`CodeTransformation: GetTransformation error = ${errorMessage}`)
            telemetry.codeTransform_logApiError.emit({
                codeTransformApiNames: 'GetTransformation',
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: jobId,
                codeTransformApiErrorMessage: errorMessage,
                codeTransformRequestId: e.requestId ?? '',
                result: MetadataResult.Fail,
                reason: 'GetTransformationFailed',
            })
            throw new Error('Error while polling job status')
        }
    }
    return status
}

export async function preTransformationUploadCode() {
    await vscode.commands.executeCommand('aws.amazonq.refresh')
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.focus')

    let uploadId = ''
    let payloadFilePath = ''
    throwIfCancelled()
    try {
        payloadFilePath = await zipCode(transformByQState.getDependencyFolderInfo()!)
        transformByQState.setPayloadFilePath(payloadFilePath)
        uploadId = await uploadPayload(payloadFilePath)
    } catch (err) {
        const errorMessage = `Failed to upload code due to ${(err as Error).message}`
        getLogger().error(errorMessage)
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            result: MetadataResult.Fail,
            reason: 'UploadArchiveFailed',
        })
        throw err
    }

    await sleep(2000) // sleep before starting job to prevent ThrottlingException
    throwIfCancelled()

    return uploadId
}

export async function startTransformationJob(uploadId: string) {
    let jobId = ''
    try {
        jobId = await startJob(uploadId)
    } catch (error) {
        const errorMessage = CodeWhispererConstants.failedToStartJobMessage
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            result: MetadataResult.Fail,
            reason: 'StartJobFailed',
        })
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Start job failed')
    }
    transformByQState.setJobId(encodeHTML(jobId))
    await vscode.commands.executeCommand('aws.amazonq.refresh')

    await sleep(2000) // sleep before polling job to prevent ThrottlingException
    throwIfCancelled()

    return jobId
}

export async function pollTransformationStatusUntilPlanReady(jobId: string) {
    try {
        await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForPlanGenerated)
    } catch (error) {
        const errorMessage = CodeWhispererConstants.failedToCompleteJobMessage
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Poll job failed')
    }
    let plan = undefined
    try {
        plan = await getTransformationPlan(jobId)
    } catch (error) {
        const errorMessage = CodeWhispererConstants.failedToCompleteJobMessage
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Get plan failed')
    }

    const planFilePath = path.join(os.tmpdir(), 'transformation-plan.md')
    fs.writeFileSync(planFilePath, plan)
    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(planFilePath))
    transformByQState.setPlanFilePath(planFilePath)
    await vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', true)
    throwIfCancelled()
}

export async function pollTransformationStatusUntilComplete(jobId: string) {
    let status = ''
    try {
        status = await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForCheckingDownloadUrl)
    } catch (error) {
        const errorMessage = CodeWhispererConstants.failedToCompleteJobMessage
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Poll job failed')
    }

    return status
}
