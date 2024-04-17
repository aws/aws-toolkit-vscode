/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import * as codeWhisperer from '../../client/codewhisperer'
import * as crypto from 'crypto'
import * as CodeWhispererConstants from '../../models/constants'
import {
    FolderInfo,
    HilZipManifest,
    IHilZipManifestParams,
    sessionPlanProgress,
    StepProgress,
    transformByQState,
    TransformByQStatus,
    TransformByQStoppedError,
    ZipManifest,
} from '../../models/model'
import { getLogger } from '../../../shared/logger'
import {
    CreateUploadUrlResponse,
    TransformationProgressUpdate,
    TransformationSteps,
    UploadContext,
} from '../../client/codewhispereruserclient'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import AdmZip from 'adm-zip'
import globals from '../../../shared/extensionGlobals'
import { CredentialSourceId, telemetry } from '../../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency } from '../../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import request from '../../../common/request'
import { projectSizeTooLargeMessage } from '../../../amazonqGumby/chat/controller/messenger/stringConstants'
import { ZipExceedsSizeLimitError } from '../../../amazonqGumby/errors'
import { writeLogs } from './transformFileHandler'
import { AuthUtil } from '../../util/authUtil'
import { createCodeWhispererChatStreamingClient } from '../../../shared/clients/codewhispererChatClient'
import { downloadExportResultArchive } from '../../../shared/utilities/download'
import { ExportIntent } from '@amzn/codewhisperer-streaming'

export function getSha256(buffer: Buffer) {
    const hasher = crypto.createHash('sha256')
    hasher.update(buffer)
    return hasher.digest('base64')
}

export async function getAuthType() {
    let authType: CredentialSourceId | undefined = undefined
    if (AuthUtil.instance.isEnterpriseSsoInUse() && AuthUtil.instance.isConnectionValid()) {
        authType = 'iamIdentityCenter'
    } else if (AuthUtil.instance.isBuilderIdInUse() && AuthUtil.instance.isConnectionValid()) {
        authType = 'awsId'
    }
    return authType
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
        const errorMessage = (e as Error).message
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

export async function restartJob(jobId: string) {
    if (jobId !== '') {
        try {
            const apiStartTime = Date.now()
            const response = await codeWhisperer.codeWhispererClient.codeModernizerResumeTransformation({
                transformationJobId: jobId,
                userActionStatus: 'COMPLETED', // can be "COMPLETED" or "REJECTED"
            })
            if (response) {
                // telemetry.codeTransform_logApiLatency.emit({
                //     codeTransformApiNames: 'StopTransformation',
                //     codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                //     codeTransformJobId: jobId,
                //     codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
                //     codeTransformRequestId: response.$response.requestId,
                //     result: MetadataResult.Pass,
                // })
                // always store request ID, but it will only show up in a notification if an error occurs
                console.log('Resume transformation success', apiStartTime, response)
                // always store request ID, but it will only show up in a notification if an error occurs
                if (response.$response.requestId) {
                    transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
                }
                return response.transformationStatus
            }
        } catch (e: any) {
            const errorMessage = (e as Error).message
            getLogger().error(`CodeTransformation: ResumeTransformation error = ${errorMessage}`)
            // telemetry.codeTransform_logApiError.emit({
            //     codeTransformApiNames: 'StopTransformation',
            //     codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            //     codeTransformJobId: jobId,
            //     codeTransformApiErrorMessage: errorMessage,
            //     codeTransformRequestId: e.requestId ?? '',
            //     result: MetadataResult.Fail,
            //     reason: 'StopTransformationFailed',
            // })
            throw new Error('Resume transformation job failed')
        }
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
            const errorMessage = (e as Error).message
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

export async function uploadPayload(payloadFileName: string, uploadContext?: UploadContext) {
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
            uploadContext,
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
        const errorMessage = (e as Error).message
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
        const errorMessage = (e as Error).message
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

interface IZipManifestParams {
    dependenciesFolder: FolderInfo
    hilZipParams?: IHilZipManifestParams
}
export function createZipManifest({ dependenciesFolder, hilZipParams }: IZipManifestParams) {
    const zipManifest = hilZipParams
        ? new HilZipManifest(hilZipParams, dependenciesFolder)
        : new ZipManifest(dependenciesFolder)
    return zipManifest
}

interface IZipCodeParams {
    dependenciesFolder: FolderInfo
    humanInTheLoopFlag?: boolean
    modulePath?: string
    zipManifest: ZipManifest | HilZipManifest
}
export async function zipCode({ dependenciesFolder, humanInTheLoopFlag, modulePath, zipManifest }: IZipCodeParams) {
    console.log('In zipCode', dependenciesFolder, modulePath, zipManifest)
    let tempFilePath = undefined
    let zipStartTime = undefined
    let logFilePath = undefined
    try {
        throwIfCancelled()
        zipStartTime = Date.now()
        const zip = new AdmZip()

        // If no modulePath is passed in, we are not uploaded the source folder
        // NOTE: We only upload dependencies for human in the loop work
        if (modulePath) {
            const sourceFiles = getFilesRecursively(modulePath, false)
            for (const file of sourceFiles) {
                const relativePath = path.relative(modulePath, file)
                const paddedPath = path.join('sources', relativePath)
                zip.addLocalFile(file, path.dirname(paddedPath))
            }
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
            telemetry.codeTransform_dependenciesCopied.emit({
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                result: MetadataResult.Pass,
            })
        } else {
            if (zipManifest instanceof ZipManifest) {
                zipManifest.dependenciesRoot = undefined
            }
        }

        zip.addFile('manifest.json', Buffer.from(JSON.stringify(zipManifest)), 'utf-8')

        throwIfCancelled()

        // add text file with logs from mvn clean install and mvn copy-dependencies
        logFilePath = await writeLogs()
        // We don't add build-logs.txt file to the manifest if we are
        // uploading HIL artifacts
        if (!humanInTheLoopFlag) {
            zip.addLocalFile(logFilePath)
        }

        tempFilePath = path.join(os.tmpdir(), 'zipped-code.zip')
        fs.writeFileSync(tempFilePath, zip.toBuffer())
        if (fs.existsSync(dependenciesFolder.path)) {
            fs.rmSync(dependenciesFolder.path, { recursive: true, force: true })
        }
    } catch (e: any) {
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: 'Failed to zip project',
            result: MetadataResult.Fail,
            reason: 'ZipCreationFailed',
        })
        throw Error('Failed to zip project')
    } finally {
        if (logFilePath) {
            fs.rmSync(logFilePath)
        }
    }

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
        const errorMessage = (e as Error).message
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
        const errorMessage = (e as Error).message
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

export async function getTransformationSteps(jobId: string, handleThrottleFlag: boolean) {
    try {
        // prevent ThrottlingException
        if (handleThrottleFlag) {
            await sleep(2000)
        }
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
        const errorMessage = (e as Error).message
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
            /**
             * If we find a paused state, we need the user to take action. We will set the global
             * state for polling status and early exit.
             */
            if (CodeWhispererConstants.pausedStates.includes(status)) {
                transformByQState.setPolledJobStatus(TransformByQStatus.WaitingUserInput)
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
            let errorMessage = (e as Error).message
            errorMessage += ` -- ${transformByQState.getJobFailureMetadata()}`
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

export function getArtifactsFromProgressUpdate(progressUpdate: TransformationProgressUpdate) {
    console.log('In getDownloadArtifactIdentifiers', progressUpdate)
    const artifactType = progressUpdate.downloadArtifacts?.[0]?.downloadArtifactType
    const artifactId = progressUpdate.downloadArtifacts?.[0]?.downloadArtifactId
    return {
        artifactId,
        artifactType,
    }
}

export function findDownloadArtifactStep(transformationSteps: TransformationSteps) {
    console.log('In findDownloadArtifactStep', transformationSteps)
    for (let i = 0; i < transformationSteps.length; i++) {
        const progressUpdates = transformationSteps[i].progressUpdates
        if (progressUpdates?.length) {
            for (let j = 0; j < progressUpdates.length; j++) {
                if (
                    progressUpdates[j].downloadArtifacts?.[0]?.downloadArtifactType ||
                    progressUpdates[j].downloadArtifacts?.[0]?.downloadArtifactId
                ) {
                    return {
                        transformationStep: transformationSteps[i],
                        progressUpdate: progressUpdates[j],
                    }
                }
            }
        }
    }
    return {
        transformationStep: undefined,
        progressUpdate: undefined,
    }
}

interface IDownloadResultArchiveParams {
    jobId: string
    downloadArtifactId: string
    pathToArchive: string
}
export async function downloadResultArchive({
    jobId,
    downloadArtifactId,
    pathToArchive,
}: IDownloadResultArchiveParams) {
    console.log('In downloadHilResultArchive', jobId, downloadArtifactId, pathToArchive)
    let downloadErrorMessage = undefined
    const cwStreamingClient = await createCodeWhispererChatStreamingClient()
    try {
        await downloadExportResultArchive(
            cwStreamingClient,
            {
                exportId: jobId,
                exportIntent: ExportIntent.TRANSFORMATION,
                exportContext: {
                    transformationExportContext: {
                        downloadArtifactId,
                        downloadArtifactType: 'ClientInstructions',
                    },
                },
            },
            pathToArchive
        )
    } catch (e: any) {
        downloadErrorMessage = (e as Error).message
        // This allows the customer to retry the download
        getLogger().error(`CodeTransformation: ExportResultArchive error = ${downloadErrorMessage}`)
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'ExportResultArchive',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: transformByQState.getJobId(),
            codeTransformApiErrorMessage: downloadErrorMessage,
            codeTransformRequestId: e.requestId ?? '',
            result: MetadataResult.Fail,
            reason: 'ExportResultArchiveFailed',
        })
    }
}

export async function downloadHilResultArchive(jobId: string, downloadArtifactId: string, pathToArchiveDir: string) {
    console.log('Inside downloadResultArchive artifacts', jobId, downloadArtifactId, pathToArchiveDir)
    if (!fs.existsSync(pathToArchiveDir)) {
        fs.mkdirSync(pathToArchiveDir)
    }
    const pathToArchive = path.join(pathToArchiveDir, 'ExportResultsArchive.zip')
    const downloadResults = await downloadResultArchive({ jobId, downloadArtifactId, pathToArchive })
    console.log('DownloadResults', downloadResults)

    let downloadErrorMessage = undefined
    try {
        // Download and deserialize the zip
        const zip = new AdmZip(pathToArchive)
        zip.extractAllTo(pathToArchive)
    } catch (e) {
        downloadErrorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: ExportResultArchive error = ${downloadErrorMessage}`)
        throw new Error('Error downloading HIL artifacts')
    }
    const manifestFileVirtualFileReference = vscode.Uri.file(`${pathToArchiveDir}/manifest.json`)
    const pomFileVirtualFileReference = vscode.Uri.file(`${pathToArchiveDir}/pom.xml`)
    return { manifestFileVirtualFileReference, pomFileVirtualFileReference }
}
