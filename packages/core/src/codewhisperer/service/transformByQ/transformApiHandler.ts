/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports
import * as path from 'path'
import * as os from 'os'
import * as codeWhisperer from '../../client/codewhisperer'
import * as crypto from 'crypto'
import * as CodeWhispererConstants from '../../models/constants'
import {
    FolderInfo,
    HilZipManifest,
    IHilZipManifestParams,
    jobPlanProgress,
    sessionJobHistory,
    StepProgress,
    TransformationType,
    transformByQState,
    TransformByQStatus,
    TransformByQStoppedError,
    ZipManifest,
} from '../../models/model'
import { getLogger } from '../../../shared/logger'
import {
    CreateUploadUrlResponse,
    ProgressUpdates,
    TransformationProgressUpdate,
    TransformationSteps,
    TransformationUserActionStatus,
    UploadContext,
} from '../../client/codewhispereruserclient'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import AdmZip from 'adm-zip'
import globals from '../../../shared/extensionGlobals'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency } from '../../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import request from '../../../shared/request'
import { JobStoppedError, ZipExceedsSizeLimitError } from '../../../amazonqGumby/errors'
import { writeLogs } from './transformFileHandler'
import { createCodeWhispererChatStreamingClient } from '../../../shared/clients/codewhispererChatClient'
import { downloadExportResultArchive } from '../../../shared/utilities/download'
import { ExportIntent, TransformationDownloadArtifactType } from '@amzn/codewhisperer-streaming'
import fs from '../../../shared/fs/fs'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { encodeHTML } from '../../../shared/utilities/textUtilities'
import { convertToTimeString } from '../../../shared/datetime'
import { getAuthType } from '../../../auth/utils'

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

export function updateJobHistory() {
    if (transformByQState.getJobId() !== '') {
        sessionJobHistory[transformByQState.getJobId()] = {
            startTime: transformByQState.getStartTime(),
            projectName: transformByQState.getProjectName(),
            status: transformByQState.getPolledJobStatus(),
            duration: convertToTimeString(calculateTotalLatency(CodeTransformTelemetryState.instance.getStartTime())),
        }
    }
    return sessionJobHistory
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
        const uploadFileByteSize = (await nodefs.promises.stat(fileName)).size
        getLogger().info(
            `Uploading project artifact at %s with checksum %s using uploadId: %s and size %s kB`,
            fileName,
            sha256,
            resp.uploadId,
            Math.round(uploadFileByteSize / 1000)
        )

        const response = await request.fetch('PUT', resp.uploadUrl, {
            body: buffer,
            headers: getHeadersObj(sha256, resp.kmsKeyArn),
        }).response
        getLogger().info(`CodeTransformation: Status from S3 Upload = ${response.status}`)
    } catch (e: any) {
        let errorMessage = `The upload failed due to: ${(e as Error).message}. For more information, see the [Amazon Q documentation](${CodeWhispererConstants.codeTransformTroubleshootUploadError})`
        if (errorMessage.includes('Request has expired')) {
            errorMessage = CodeWhispererConstants.errorUploadingWithExpiredUrl
        } else if (errorMessage.includes('Failed to establish a socket connection')) {
            errorMessage = CodeWhispererConstants.socketConnectionFailed
        } else if (errorMessage.includes('self signed certificate in certificate chain')) {
            errorMessage = CodeWhispererConstants.selfSignedCertificateError
        }
        getLogger().error(`CodeTransformation: UploadZip error = ${e}`)
        throw new Error(errorMessage)
    }
}

export async function resumeTransformationJob(jobId: string, userActionStatus: TransformationUserActionStatus) {
    try {
        const response = await codeWhisperer.codeWhispererClient.codeModernizerResumeTransformation({
            transformationJobId: jobId,
            userActionStatus, // can be "COMPLETED" or "REJECTED"
        })
        if (response) {
            // always store request ID, but it will only show up in a notification if an error occurs
            return response.transformationStatus
        }
    } catch (e: any) {
        const errorMessage = `Resuming the job failed due to: ${(e as Error).message}`
        getLogger().error(`CodeTransformation: ResumeTransformation error = ${errorMessage}`)
        throw new Error(errorMessage)
    }
}

export async function stopJob(jobId: string) {
    if (!jobId) {
        return
    }

    try {
        const response = await codeWhisperer.codeWhispererClient.codeModernizerStopCodeTransformation({
            transformationJobId: jobId,
        })
        if (response !== undefined) {
            // always store request ID, but it will only show up in a notification if an error occurs
            if (response.$response.requestId) {
                transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
            }
        }
    } catch (e: any) {
        const errorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: StopTransformation error = ${errorMessage}`)
        throw new Error('Stop job failed')
    }
}

export async function uploadPayload(payloadFileName: string, uploadContext?: UploadContext) {
    const buffer = Buffer.from(await fs.readFileBytes(payloadFileName))
    const sha256 = getSha256(buffer)

    throwIfCancelled()
    let response = undefined
    try {
        response = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
            uploadContext,
        })
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }
    } catch (e: any) {
        const errorMessage = `The upload failed due to: ${(e as Error).message}`
        getLogger().error(`CodeTransformation: CreateUploadUrl error: = ${e}`)
        throw new Error(errorMessage)
    }

    try {
        await uploadArtifactToS3(payloadFileName, response, sha256, buffer)
    } catch (e: any) {
        const errorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: UploadArtifactToS3 error: = ${errorMessage}`)
        throw new Error(errorMessage)
    }

    // UploadContext only exists for subsequent uploads, and they will return a uploadId that is NOT
    // the jobId. Only the initial call will uploadId be the jobId
    if (!uploadContext) {
        transformByQState.setJobId(encodeHTML(response.uploadId))
    }
    jobPlanProgress['uploadCode'] = StepProgress.Succeeded
    if (transformByQState.getTransformationType() === TransformationType.SQL_CONVERSION) {
        // if doing a SQL conversion, we don't build the code or generate a plan, so mark these steps as succeeded immediately so that next step renders
        jobPlanProgress['buildCode'] = StepProgress.Succeeded
        jobPlanProgress['generatePlan'] = StepProgress.Succeeded
    }
    updateJobHistory()
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

const sourceExcludedExtensions = ['.DS_Store']

/**
 * Determines if the specified file path corresponds to a Maven metadata file
 * by checking against known metadata file extensions. This is used to identify
 * files that might trigger Maven to recheck or redownload dependencies from source repositories.
 *
 * @param path The file path to evaluate for exclusion based on its extension.
 * @returns {boolean} Returns true if the path ends with an extension associated with Maven metadata files; otherwise, false.
 */
function isExcludedDependencyFile(path: string): boolean {
    return mavenExcludedExtensions.some((extension) => path.endsWith(extension))
}

// do not zip the .DS_Store file as it may appear in the diff.patch
function isExcludedSourceFile(path: string): boolean {
    return sourceExcludedExtensions.some((extension) => path.endsWith(extension))
}

// zip all dependency files and all source files excluding "target" (contains large JARs) plus ".git" and ".idea" (may appear in diff.patch)
export function getFilesRecursively(dir: string, isDependenciesFolder: boolean): string[] {
    const entries = nodefs.readdirSync(dir, { withFileTypes: true })
    const files = entries.flatMap((entry) => {
        const res = path.resolve(dir, entry.name)
        if (entry.isDirectory()) {
            if (isDependenciesFolder) {
                // include all dependency files
                return getFilesRecursively(res, isDependenciesFolder)
            } else if (entry.name !== 'target' && entry.name !== '.git' && entry.name !== '.idea') {
                // exclude the above directories when zipping source code
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
    hilZipParams?: IHilZipManifestParams
}
export function createZipManifest({ hilZipParams }: IZipManifestParams) {
    const zipManifest = hilZipParams ? new HilZipManifest(hilZipParams) : new ZipManifest()
    return zipManifest
}

interface IZipCodeParams {
    dependenciesFolder?: FolderInfo
    humanInTheLoopFlag?: boolean
    projectPath?: string
    zipManifest: ZipManifest | HilZipManifest
}

interface ZipCodeResult {
    dependenciesCopied: boolean
    tempFilePath: string
    fileSize: number
}

export async function zipCode(
    { dependenciesFolder, humanInTheLoopFlag, projectPath, zipManifest }: IZipCodeParams,
    zip: AdmZip = new AdmZip()
) {
    let tempFilePath = undefined
    let logFilePath = undefined
    let dependenciesCopied = false
    try {
        throwIfCancelled()

        // if no project Path is passed in, we are not uploaded the source folder
        // we only upload dependencies for human in the loop work
        if (projectPath) {
            const sourceFiles = getFilesRecursively(projectPath, false)
            let sourceFilesSize = 0
            for (const file of sourceFiles) {
                if (nodefs.statSync(file).isDirectory() || isExcludedSourceFile(file)) {
                    getLogger().info('CodeTransformation: Skipping file')
                    continue
                }
                const relativePath = path.relative(projectPath, file)
                const paddedPath = path.join('sources', relativePath)
                zip.addLocalFile(file, path.dirname(paddedPath))
                sourceFilesSize += (await nodefs.promises.stat(file)).size
            }
            getLogger().info(`CodeTransformation: source code files size = ${sourceFilesSize}`)
        }

        if (transformByQState.getMultipleDiffs() && zipManifest instanceof ZipManifest) {
            zipManifest.transformCapabilities.push('SELECTIVE_TRANSFORMATION_V1')
        }

        if (
            transformByQState.getTransformationType() === TransformationType.SQL_CONVERSION &&
            zipManifest instanceof ZipManifest
        ) {
            // note that zipManifest must be a ZipManifest since only other option is HilZipManifest which is not used for SQL conversions
            const metadataZip = new AdmZip(transformByQState.getMetadataPathSQL())
            zipManifest.requestedConversions = {
                sqlConversion: {
                    source: transformByQState.getSourceDB(),
                    target: transformByQState.getTargetDB(),
                    schema: transformByQState.getSchema(),
                    host: transformByQState.getSourceServerName(),
                    sctFileName: metadataZip.getEntries().filter((entry) => entry.name.endsWith('.sct'))[0].name,
                },
            }
            // TO-DO: later consider making this add to path.join(zipManifest.dependenciesRoot, 'qct-sct-metadata', entry.entryName) so that it's more organized
            metadataZip
                .getEntries()
                .forEach((entry) => zip.addFile(path.join(zipManifest.dependenciesRoot, entry.name), entry.getData()))
            const sqlMetadataSize = (await nodefs.promises.stat(transformByQState.getMetadataPathSQL())).size
            getLogger().info(`CodeTransformation: SQL metadata file size = ${sqlMetadataSize}`)
        }

        throwIfCancelled()

        let dependencyFiles: string[] = []
        if (dependenciesFolder && (await fs.exists(dependenciesFolder.path))) {
            dependencyFiles = getFilesRecursively(dependenciesFolder.path, true)
        }

        if (dependenciesFolder && dependencyFiles.length > 0) {
            let dependencyFilesSize = 0
            for (const file of dependencyFiles) {
                if (isExcludedDependencyFile(file)) {
                    continue
                }
                const relativePath = path.relative(dependenciesFolder.path, file)
                // const paddedPath = path.join(`dependencies/${dependenciesFolder.name}`, relativePath)
                const paddedPath = path.join(`dependencies/`, relativePath)
                zip.addLocalFile(file, path.dirname(paddedPath))
                dependencyFilesSize += (await nodefs.promises.stat(file)).size
            }
            getLogger().info(`CodeTransformation: dependency files size = ${dependencyFilesSize}`)
            dependenciesCopied = true
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
        await fs.writeFile(tempFilePath, zip.toBuffer())
        if (dependenciesFolder && (await fs.exists(dependenciesFolder.path))) {
            await fs.delete(dependenciesFolder.path, { recursive: true, force: true })
        }
    } catch (e: any) {
        getLogger().error(`CodeTransformation: zipCode error = ${e}`)
        throw Error('Failed to zip project')
    } finally {
        if (logFilePath) {
            await fs.delete(logFilePath)
        }
    }

    const zipSize = (await nodefs.promises.stat(tempFilePath)).size

    const exceedsLimit = zipSize > CodeWhispererConstants.uploadZipSizeLimitInBytes

    getLogger().info(`CodeTransformation: created ZIP of size ${zipSize} at ${tempFilePath}`)

    if (exceedsLimit) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.projectSizeTooLargeNotification)
        transformByQState.getChatControllers()?.transformationFinished.fire({
            message: CodeWhispererConstants.projectSizeTooLargeChatMessage,
            tabID: ChatSessionManager.Instance.getSession().tabID,
        })
        throw new ZipExceedsSizeLimitError()
    }
    return { dependenciesCopied: dependenciesCopied, tempFilePath: tempFilePath, fileSize: zipSize } as ZipCodeResult
}

export async function startJob(uploadId: string) {
    const sourceLanguageVersion = `JAVA_${transformByQState.getSourceJDKVersion()}`
    const targetLanguageVersion = `JAVA_${transformByQState.getTargetJDKVersion()}`
    try {
        const response = await codeWhisperer.codeWhispererClient.codeModernizerStartCodeTransformation({
            workspaceState: {
                uploadId: uploadId,
                programmingLanguage: { languageName: CodeWhispererConstants.defaultLanguage.toLowerCase() },
            },
            transformationSpec: {
                transformationType: CodeWhispererConstants.transformationType, // shared b/w language upgrades & sql conversions for now
                source: { language: sourceLanguageVersion }, // dummy value of JDK8 used for SQL conversions just so that this API can be called
                target: { language: targetLanguageVersion }, // always JDK17
            },
        })
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }
        return response.transformationJobId
    } catch (e: any) {
        const errorMessage = `Starting the job failed due to: ${(e as Error).message}`
        getLogger().error(`CodeTransformation: StartTransformation error = ${errorMessage}`)
        throw new Error(errorMessage)
    }
}

export function getImageAsBase64(filePath: string) {
    const fileContents = nodefs.readFileSync(filePath, { encoding: 'base64' })
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
    stepZeroProgressUpdates.forEach((update) => {
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
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }

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
        const authType = await getAuthType()
        const linesOfCode = Number(
            jobStatistics.find((stat: { name: string; value: string }) => stat.name === 'linesOfCode').value
        )
        transformByQState.setLinesOfCodeSubmitted(linesOfCode)
        if (authType === 'iamIdentityCenter' && linesOfCode > CodeWhispererConstants.codeTransformLocThreshold) {
            plan += CodeWhispererConstants.codeTransformBillingText(linesOfCode)
        }
        plan += `<div style="display: flex;"><div style="flex: 1; border: 1px solid #424750; border-radius: 8px; padding: 10px;"><p>${
            CodeWhispererConstants.planIntroductionMessage
        }</p></div>${getJobStatisticsHtml(jobStatistics)}</div>`
        plan += `<div style="margin-top: 32px; border: 1px solid #424750; border-radius: 8px; padding: 10px;"><p style="font-size: 18px; margin-bottom: 4px;"><b>${CodeWhispererConstants.planHeaderMessage}</b></p><i>${CodeWhispererConstants.planDisclaimerMessage} <a href="https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/code-transformation.html">Read more.</a></i><br><br>`
        response.transformationPlan.transformationSteps.slice(1).forEach((step) => {
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

        /* Means API call failed
         * If response is defined, means a display/parsing error occurred, so continue transformation
         */
        if (response === undefined) {
            throw new Error('Get plan API call failed')
        }
    }
}

export async function getTransformationSteps(jobId: string, handleThrottleFlag: boolean) {
    try {
        // prevent ThrottlingException
        if (handleThrottleFlag) {
            await sleep(2000)
        }
        const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
            transformationJobId: jobId,
        })
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        }
        return response.transformationPlan.transformationSteps.slice(1) // skip step 0 (contains supplemental info)
    } catch (e: any) {
        const errorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: GetTransformationPlan error = ${errorMessage}`)
        throw e
    }
}

export async function pollTransformationJob(jobId: string, validStates: string[]) {
    let status: string = ''
    while (true) {
        throwIfCancelled()
        try {
            const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformation({
                transformationJobId: jobId,
            })
            status = response.transformationJob.status!
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
                transformByQState.setJobFailureErrorChatMessage(
                    `${CodeWhispererConstants.failedToCompleteJobGenericChatMessage} ${errorMessage}`
                )
                transformByQState.setJobFailureErrorNotification(
                    `${CodeWhispererConstants.failedToCompleteJobGenericNotification} ${errorMessage}`
                )
                transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
            }
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
                transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
                throw new JobStoppedError(response.$response.requestId)
            }
            await sleep(CodeWhispererConstants.transformationJobPollingIntervalSeconds * 1000)
        } catch (e: any) {
            let errorMessage = (e as Error).message
            errorMessage += ` -- ${transformByQState.getJobFailureMetadata()}`
            getLogger().error(`CodeTransformation: GetTransformation error = ${errorMessage}`)
            throw e
        }
    }
    return status
}

export function getArtifactsFromProgressUpdate(progressUpdate?: TransformationProgressUpdate) {
    const artifactType = progressUpdate?.downloadArtifacts?.[0]?.downloadArtifactType
    const artifactId = progressUpdate?.downloadArtifacts?.[0]?.downloadArtifactId
    return {
        artifactId,
        artifactType,
    }
}

export function findDownloadArtifactStep(transformationSteps: TransformationSteps) {
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

export async function downloadResultArchive(
    jobId: string,
    downloadArtifactId: string | undefined,
    pathToArchive: string,
    downloadArtifactType: TransformationDownloadArtifactType
) {
    let downloadErrorMessage = undefined
    const cwStreamingClient = await createCodeWhispererChatStreamingClient()

    try {
        await downloadExportResultArchive(
            cwStreamingClient,
            {
                exportId: jobId,
                exportIntent: ExportIntent.TRANSFORMATION,
            },
            pathToArchive
        )
    } catch (e: any) {
        downloadErrorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: ExportResultArchive error = ${downloadErrorMessage}`)
        throw e
    } finally {
        cwStreamingClient.destroy()
    }
}

export async function downloadAndExtractResultArchive(
    jobId: string,
    downloadArtifactId: string | undefined,
    pathToArchiveDir: string,
    downloadArtifactType: TransformationDownloadArtifactType
) {
    const archivePathExists = await fs.existsDir(pathToArchiveDir)
    if (!archivePathExists) {
        await fs.mkdir(pathToArchiveDir)
    }

    const pathToArchive = path.join(pathToArchiveDir, 'ExportResultsArchive.zip')

    let downloadErrorMessage = undefined
    try {
        // Download and deserialize the zip
        await downloadResultArchive(jobId, downloadArtifactId, pathToArchive, downloadArtifactType)
        const zip = new AdmZip(pathToArchive)
        zip.extractAllTo(pathToArchiveDir)
    } catch (e) {
        downloadErrorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: ExportResultArchive error = ${downloadErrorMessage}`)
        throw new Error('Error downloading transformation result artifacts: ' + downloadErrorMessage)
    }
}

export async function downloadHilResultArchive(jobId: string, downloadArtifactId: string, pathToArchiveDir: string) {
    await downloadAndExtractResultArchive(
        jobId,
        downloadArtifactId,
        pathToArchiveDir,
        TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS
    )

    // manifest.json
    // pomFolder/pom.xml or manifest has pomFolderName path
    const manifestFileVirtualFileReference = vscode.Uri.file(path.join(pathToArchiveDir, 'manifest.json'))
    const pomFileVirtualFileReference = vscode.Uri.file(path.join(pathToArchiveDir, 'pomFolder', 'pom.xml'))
    return { manifestFileVirtualFileReference, pomFileVirtualFileReference }
}
