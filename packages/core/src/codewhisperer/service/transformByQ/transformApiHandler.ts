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
    jobPlanProgress,
    StepProgress,
    transformByQState,
    TransformByQStoppedError,
    ZipManifest,
    SessionJobHistory,
} from '../../models/model'
import { getLogger } from '../../../shared/logger'
import { CreateUploadUrlResponse, ProgressUpdates } from '../../client/codewhispereruserclient'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import AdmZip from 'adm-zip'
import globals from '../../../shared/extensionGlobals'
import { CredentialSourceId, telemetry } from '../../../shared/telemetry/telemetry'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency } from '../../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import request from '../../../common/request'
import { ZipExceedsSizeLimitError } from '../../../amazonqGumby/errors'
import { writeLogs } from './transformFileHandler'
import { AuthUtil } from '../../util/authUtil'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { encodeHTML } from '../../../shared/utilities/textUtilities'

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
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
                    codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
    transformByQState.setJobId(encodeHTML(response.uploadId))
    await SessionJobHistory.Instance.update()
    return response.uploadId
}

/**
 * Array of file extensions used by Maven as metadata in the local repository.
 * Files with these extensions influence Maven's behavior during compile time,
 * particularly in checking the availability of source repositories and potentially
 * re-downloading dependencies if the source is not accessible. Removing these
 * files can prevent Maven from attempting to download dependencies again.
 */
const mavenExcludedExtensions = ['.repositories', '.sha1']

/**
 * Determines if the specified file path corresponds to a Maven metadata file
 * by checking against known metadata file extensions. This is used to identify
 * files that might trigger Maven to recheck or redownload dependencies from source repositories.
 *
 * @param path The file path to evaluate for exclusion based on its extension.
 * @returns {boolean} Returns true if the path ends with an extension associated with Maven metadata files; otherwise, false.
 */
function isExcludedDependencyFile(path: string): boolean {
    return mavenExcludedExtensions.some(extension => path.endsWith(extension))
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
    let tempFilePath = undefined
    let zipStartTime = undefined
    try {
        const modulePath = transformByQState.getProjectPath()
        throwIfCancelled()
        zipStartTime = Date.now()
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
                if (isExcludedDependencyFile(file)) {
                    continue
                }
                const relativePath = path.relative(dependenciesFolder.path, file)
                const paddedPath = path.join(`dependencies/${dependenciesFolder.name}`, relativePath)
                zip.addLocalFile(file, path.dirname(paddedPath))
            }
            zipManifest.dependenciesRoot += `${dependenciesFolder.name}/`
            telemetry.codeTransform_dependenciesCopied.emit({
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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

        tempFilePath = path.join(os.tmpdir(), 'zipped-code.zip')
        fs.writeFileSync(tempFilePath, zip.toBuffer())
        if (fs.existsSync(dependenciesFolder.path)) {
            fs.rmSync(dependenciesFolder.path, { recursive: true, force: true })
        }
        fs.rmSync(logFilePath) // will always exist here
    } catch (e: any) {
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformApiErrorMessage: 'Failed to zip project',
            result: MetadataResult.Fail,
            reason: 'ZipCreationFailed',
        })
        throw Error('Failed to zip project')
    }

    const zipSize = (await fs.promises.stat(tempFilePath)).size

    const exceedsLimit = zipSize > CodeWhispererConstants.uploadZipSizeLimitInBytes

    // Later, consider adding field for number of source lines of code
    telemetry.codeTransform_jobCreateZipEndTime.emit({
        codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
        codeTransformTotalByteSize: zipSize,
        codeTransformRunTimeLatency: calculateTotalLatency(zipStartTime),
        result: exceedsLimit ? MetadataResult.Fail : MetadataResult.Pass,
    })

    if (exceedsLimit) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.projectSizeTooLargeNotification)
        transformByQState.getChatControllers()?.transformationFinished.fire({
            message: CodeWhispererConstants.projectSizeTooLargeChatMessage,
            tabID: ChatSessionManager.Instance.getSession().tabID,
        })
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
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e.requestId ?? '',
            result: MetadataResult.Fail,
            reason: 'StartTransformationFailed',
        })
        throw new Error(`Start job failed: ${errorMessage}`)
    }
}

export function getImageAsBase64(filePath: string) {
    const fileContents = fs.readFileSync(filePath, { encoding: 'base64' })
    return `data:image/svg+xml;base64,${fileContents}`
}

/*
 * Given the icon name from core/resources/icons/aws/amazonq, get the appropriate icon according to the user's theme.
 * ex. getIcon('transform-file') returns the 'transform-file-light.svg' icon if user has a light theme enabled,
 * otherwise 'transform-file-dark.svg' is returned.
 */
export function getTransformationIcon(name: string) {
    let iconPath = ''
    switch (name) {
        case 'linesOfCode':
            iconPath = 'transform-variables'
            break
        case 'plannedDependencyChanges':
            iconPath = 'transform-dependencies'
            break
        case 'plannedDeprecatedApiChanges':
            iconPath = 'transform-step-into'
            break
        case 'plannedFileChanges':
            iconPath = 'transform-file'
            break
        case 'upArrow':
            iconPath = 'transform-arrow'
            break
        case 'transformLogo':
            return getImageAsBase64(globals.context.asAbsolutePath('resources/icons/aws/amazonq/transform-logo.svg'))
        default:
            iconPath = 'transform-default'
            break
    }
    const themeColor = vscode.window.activeColorTheme.kind
    if (themeColor === vscode.ColorThemeKind.Light || themeColor === vscode.ColorThemeKind.HighContrastLight) {
        iconPath += '-light.svg'
    } else {
        iconPath += '-dark.svg'
    }
    return getImageAsBase64(globals.context.asAbsolutePath(path.join('resources/icons/aws/amazonq', iconPath)))
}

export function getFormattedString(s: string) {
    return CodeWhispererConstants.formattedStringMap.get(s) ?? s
}

export function addTableMarkdown(plan: string, stepId: string, tableMapping: { [key: string]: string }) {
    const tableObj = tableMapping[stepId]
    if (!tableObj) {
        // no table present for this step
        return plan
    }
    const table = JSON.parse(tableObj)
    plan += `\n\n\n${table.name}\n|`
    const columns = table.columnNames
    columns.forEach((columnName: string) => {
        plan += ` ${getFormattedString(columnName)} |`
    })
    plan += '\n|'
    columns.forEach((_: any) => {
        plan += '-----|'
    })
    table.rows.forEach((row: any) => {
        plan += '\n|'
        columns.forEach((columnName: string) => {
            if (columnName === 'relativePath') {
                plan += ` [${row[columnName]}](${row[columnName]}) |` // add MD link only for files
            } else {
                plan += ` ${row[columnName]} |`
            }
        })
    })
    plan += '\n\n'
    return plan
}

export function getTableMapping(stepZeroProgressUpdates: ProgressUpdates) {
    const map: { [key: string]: string } = {}
    stepZeroProgressUpdates.forEach(update => {
        // description should never be undefined since even if no data we show an empty table
        // but just in case, empty string allows us to skip this table without errors when rendering
        map[update.name] = update.description ?? ''
    })
    return map
}

export function getJobStatisticsHtml(jobStatistics: any) {
    let htmlString = ''
    if (jobStatistics.length === 0) {
        return htmlString
    }
    htmlString += `<div style="flex: 1; margin-left: 20px; border: 1px solid #424750; border-radius: 8px; padding: 10px;">`
    jobStatistics.forEach((stat: { name: string; value: string }) => {
        htmlString += `<p style="margin-bottom: 4px"><img src="${getTransformationIcon(
            stat.name
        )}" style="vertical-align: middle;"> ${getFormattedString(stat.name)}: ${stat.value}</p>`
    })
    htmlString += `</div>`
    return htmlString
}

export async function getTransformationPlan(jobId: string) {
    let response = undefined
    try {
        response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
            transformationJobId: jobId,
        })
        const apiStartTime = Date.now()
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }
        telemetry.codeTransform_logApiLatency.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformRequestId: response.$response.requestId,
            result: MetadataResult.Pass,
        })

        const stepZeroProgressUpdates = response.transformationPlan.transformationSteps[0].progressUpdates

        if (!stepZeroProgressUpdates || stepZeroProgressUpdates.length === 0) {
            // means backend API response wrong and table data is missing
            throw new Error('No progress updates found in step 0')
        }

        // gets a mapping between the ID ('name' field) of each progressUpdate (substep) and the associated table
        const tableMapping = getTableMapping(stepZeroProgressUpdates)

        const jobStatistics = JSON.parse(tableMapping['0']).rows // ID of '0' reserved for job statistics table

        // get logo directly since we only use one logo regardless of color theme
        const logoIcon = getTransformationIcon('transformLogo')

        const arrowIcon = getTransformationIcon('upArrow')

        let plan = `<style>table {border: 1px solid #424750;}</style>\n\n<a id="top"></a><br><p style="font-size: 24px;"><img src="${logoIcon}" style="margin-right: 15px; vertical-align: middle;"></img><b>${CodeWhispererConstants.planTitle}</b></p><br>`
        plan += `<div style="display: flex;"><div style="flex: 1; border: 1px solid #424750; border-radius: 8px; padding: 10px;"><p>${
            CodeWhispererConstants.planIntroductionMessage
        }</p></div>${getJobStatisticsHtml(jobStatistics)}</div>`
        plan += `<div style="margin-top: 32px; border: 1px solid #424750; border-radius: 8px; padding: 10px;"><p style="font-size: 18px; margin-bottom: 4px;"><b>${CodeWhispererConstants.planHeaderMessage}</b></p><i>${CodeWhispererConstants.planDisclaimerMessage} <a href="https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/code-transformation.html">Read more.</a></i><br><br>`
        response.transformationPlan.transformationSteps.slice(1).forEach(step => {
            plan += `<div style="border: 1px solid #424750; border-radius: 8px; padding: 20px;"><div style="display:flex; justify-content:space-between; align-items:center;"><p style="font-size: 16px; margin-bottom: 4px;">${step.name}</p><a href="#top">Scroll to top <img src="${arrowIcon}" style="vertical-align: middle"></a></div><p>${step.description}</p>`
            plan = addTableMarkdown(plan, step.id, tableMapping)
            plan += `</div><br>`
        })
        plan += `</div><br>`
        plan += `<p style="font-size: 18px; margin-bottom: 4px;"><b>Appendix</b><br><a href="#top" style="float: right; font-size: 14px;">Scroll to top <img src="${arrowIcon}" style="vertical-align: middle;"></a></p><br>`
        plan = addTableMarkdown(plan, '-1', tableMapping) // ID of '-1' reserved for appendix table
        return plan
    } catch (e: any) {
        const errorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: GetTransformationPlan error = ${errorMessage}`)
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformApiErrorMessage: errorMessage,
            codeTransformRequestId: e.requestId ?? '',
            result: MetadataResult.Fail,
            reason: 'GetTransformationPlanFailed',
        })

        /* Means API call failed
         * If response is defined, means a display/parsing error occurred, so continue transformation
         */
        if (response === undefined) {
            throw new Error('Get plan API call failed')
        }
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
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
            codeTransformRequestId: response.$response.requestId,
            result: MetadataResult.Pass,
        })
        return response.transformationPlan.transformationSteps.slice(1) // skip step 0 (contains supplemental info)
    } catch (e: any) {
        const errorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: GetTransformationPlan error = ${errorMessage}`)
        telemetry.codeTransform_logApiError.emit({
            codeTransformApiNames: 'GetTransformationPlan',
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformJobId: jobId,
                codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
                codeTransformRequestId: response.$response.requestId,
                result: MetadataResult.Pass,
            })
            status = response.transformationJob.status!
            // must be series of ifs, not else ifs
            if (CodeWhispererConstants.validStatesForJobStarted.includes(status)) {
                jobPlanProgress['startJob'] = StepProgress.Succeeded
            }
            if (CodeWhispererConstants.validStatesForBuildSucceeded.includes(status)) {
                jobPlanProgress['buildCode'] = StepProgress.Succeeded
            }
            // emit metric when job status changes
            if (status !== transformByQState.getPolledJobStatus()) {
                telemetry.codeTransform_jobStatusChanged.emit({
                    codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformJobId: jobId,
                    codeTransformStatus: status,
                    result: MetadataResult.Pass,
                    codeTransformPreviousStatus: transformByQState.getPolledJobStatus(),
                })
            }
            transformByQState.setPolledJobStatus(status)

            const errorMessage = response.transformationJob.reason
            if (errorMessage !== undefined) {
                transformByQState.setJobFailureErrorChatMessage(errorMessage)
                transformByQState.setJobFailureErrorNotification(errorMessage)
                transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
            }
            if (validStates.includes(status)) {
                break
            }
            /*
             * Below IF is only relevant for pollTransformationStatusUntilPlanReady, when pollTransformationStatusUntilComplete
             * is called, we break above on validStatesForCheckingDownloadUrl and check final status in finalizeTransformationJob
             */
            if (CodeWhispererConstants.failureStates.includes(status)) {
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
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
