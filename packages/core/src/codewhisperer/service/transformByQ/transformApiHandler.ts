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
    RegionProfile,
    sessionJobHistory,
    StepProgress,
    TransformationType,
    transformByQState,
    TransformByQStatus,
    TransformByQStoppedError,
    ZipManifest,
} from '../../models/model'
import { getLogger } from '../../../shared/logger/logger'
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
import { createLocalBuildUploadZip, extractOriginalProjectSources, writeAndShowBuildLogs } from './transformFileHandler'
import { createCodeWhispererChatStreamingClient } from '../../../shared/clients/codewhispererChatClient'
import { downloadExportResultArchive } from '../../../shared/utilities/download'
import { ExportContext, ExportIntent, TransformationDownloadArtifactType } from '@amzn/codewhisperer-streaming'
import fs from '../../../shared/fs/fs'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { encodeHTML } from '../../../shared/utilities/textUtilities'
import { convertToTimeString } from '../../../shared/datetime'
import { getAuthType } from '../../../auth/utils'
import { UserWrittenCodeTracker } from '../../tracker/userWrittenCodeTracker'
import { setContext } from '../../../shared/vscode/setContext'
import { AuthUtil } from '../../util/authUtil'
import { DiffModel } from './transformationResultsViewProvider'
import { spawnSync } from 'child_process' // eslint-disable-line no-restricted-imports
import { isClientSideBuildEnabled } from '../../../dev/config'

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
            `CodeTransformation: Uploading project artifact at %s with checksum %s using uploadId: %s and size %s kB`,
            fileName,
            sha256,
            resp.uploadId,
            Math.round(uploadFileByteSize / 1000)
        )

        let response = undefined
        /* The existing S3 client has built-in retries but it requires the bucket name, so until
         * CreateUploadUrl can be modified to return the S3 bucket name, manually implement retries.
         * Alternatively, when waitUntil supports a fixed number of retries and retriableCodes, use that.
         */
        const retriableCodes = [408, 429, 500, 502, 503, 504]
        for (let i = 0; i < 4; i++) {
            try {
                response = await request.fetch('PUT', resp.uploadUrl, {
                    body: buffer,
                    headers: getHeadersObj(sha256, resp.kmsKeyArn),
                }).response
                getLogger().info(`CodeTransformation: upload to S3 status on attempt ${i + 1}/4 = ${response.status}`)
                if (response.status === 200) {
                    break
                }
                throw new Error(
                    `Upload failed, status = ${response.status}; full response: ${JSON.stringify(response)}`
                )
            } catch (e: any) {
                if (response && !retriableCodes.includes(response.status)) {
                    throw new Error(`Upload failed with status code = ${response.status}; did not automatically retry`)
                }
                if (i !== 3) {
                    await sleep(1000 * Math.pow(2, i))
                }
            }
        }
        if (!response || response.status !== 200) {
            const uploadFailedError = `Upload failed after up to 4 attempts with status code = ${response?.status ?? 'unavailable'}`
            getLogger().error(`CodeTransformation: ${uploadFailedError}`)
            throw new Error(uploadFailedError)
        }
        getLogger().info('CodeTransformation: Upload to S3 succeeded')
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
        getLogger().info(
            `CodeTransformation: resumeTransformation API status code = ${response.$response.httpResponse.statusCode}`
        )
        return response.transformationStatus
    } catch (e: any) {
        const errorMessage = `Resuming the job failed due to: ${(e as Error).message}`
        getLogger().error(`CodeTransformation: ResumeTransformation error = %O`, e)
        throw new Error(errorMessage)
    }
}

export async function stopJob(jobId: string) {
    if (!jobId) {
        return
    }

    try {
        await codeWhisperer.codeWhispererClient.codeModernizerStopCodeTransformation({
            transformationJobId: jobId,
        })
    } catch (e: any) {
        transformByQState.setJobFailureMetadata(` (request ID: ${e.requestId ?? 'unavailable'})`)
        getLogger().error(`CodeTransformation: StopTransformation error = %O`, e)
        throw new Error('Stop job failed')
    }
}

export async function uploadPayload(
    payloadFileName: string,
    profile: RegionProfile | undefined,
    uploadContext?: UploadContext
) {
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
            profileArn: profile?.arn,
        })
    } catch (e: any) {
        const errorMessage = `Creating the upload URL failed due to: ${(e as Error).message}`
        transformByQState.setJobFailureMetadata(` (request ID: ${e.requestId ?? 'unavailable'})`)
        getLogger().error(`CodeTransformation: CreateUploadUrl error: = %O`, e)
        throw new Error(errorMessage)
    }

    getLogger().info('CodeTransformation: created upload URL successfully')

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

// exclude .DS_Store (not relevant) and Maven executables (can cause permissions issues when building if user has not ran 'chmod')
const sourceExcludedExtensions = ['.DS_Store', 'mvnw', 'mvnw.cmd']

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
            for (const entry of metadataZip.getEntries()) {
                zip.addFile(path.join(zipManifest.dependenciesRoot, entry.name), entry.getData())
            }
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

        // TO-DO: decide where exactly to put the YAML file / what to name it
        if (transformByQState.getCustomDependencyVersionFilePath() && zipManifest instanceof ZipManifest) {
            zip.addLocalFile(
                transformByQState.getCustomDependencyVersionFilePath(),
                'custom-upgrades',
                'dependency-versions.yaml'
            )
        }

        zip.addFile('manifest.json', Buffer.from(JSON.stringify(zipManifest)), 'utf-8')

        throwIfCancelled()

        // add text file with logs from mvn clean install and mvn copy-dependencies
        logFilePath = await writeAndShowBuildLogs()
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

export async function startJob(uploadId: string, profile: RegionProfile | undefined) {
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
                target: { language: targetLanguageVersion }, // JAVA_17 or JAVA_21
            },
            profileArn: profile?.arn,
        })
        getLogger().info('CodeTransformation: called startJob API successfully')
        return response.transformationJobId
    } catch (e: any) {
        const errorMessage = `Starting the job failed due to: ${(e as Error).message}`
        transformByQState.setJobFailureMetadata(` (request ID: ${e.requestId ?? 'unavailable'})`)
        getLogger().error(`CodeTransformation: StartTransformation error = %O`, e)
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

export function addTableMarkdown(plan: string, stepId: string, tableMapping: { [key: string]: string[] }) {
    const tableObjects = tableMapping[stepId]
    if (!tableObjects || tableObjects.length === 0 || tableObjects.every((table: string) => table === '')) {
        // no tables for this stepId
        return plan
    }
    const tables: any[] = []
    // eslint-disable-next-line unicorn/no-array-for-each
    tableObjects.forEach((tableObj: string) => {
        try {
            const table = JSON.parse(tableObj)
            if (table) {
                tables.push(table)
            }
        } catch (e) {
            getLogger().error(`CodeTransformation: Failed to parse table JSON, skipping: ${e}`)
        }
    })

    if (tables.every((table: any) => table.rows.length === 0)) {
        // empty tables for this stepId
        plan += `\n\nThere are no ${tables[0].name.toLowerCase()} to display.\n\n`
        return plan
    }
    // table name and columns are shared, so only add to plan once
    plan += `\n\n\n${tables[0].name}\n|`
    const columns = tables[0].columnNames
    // eslint-disable-next-line unicorn/no-array-for-each
    columns.forEach((columnName: string) => {
        plan += ` ${getFormattedString(columnName)} |`
    })
    plan += '\n|'
    // eslint-disable-next-line unicorn/no-array-for-each
    columns.forEach((_: any) => {
        plan += '-----|'
    })
    // add all rows of all tables
    // eslint-disable-next-line unicorn/no-array-for-each
    tables.forEach((table: any) => {
        // eslint-disable-next-line unicorn/no-array-for-each
        table.rows.forEach((row: any) => {
            plan += '\n|'
            // eslint-disable-next-line unicorn/no-array-for-each
            columns.forEach((columnName: string) => {
                if (columnName === 'relativePath') {
                    // add markdown link only for file paths
                    plan += ` [${row[columnName]}](${row[columnName]}) |`
                } else {
                    plan += ` ${row[columnName]} |`
                }
            })
        })
    })
    plan += '\n\n'
    return plan
}

export function getTableMapping(stepZeroProgressUpdates: ProgressUpdates) {
    const map: { [key: string]: string[] } = {}
    for (const update of stepZeroProgressUpdates) {
        if (!map[update.name]) {
            map[update.name] = []
        }
        // empty string allows us to skip this table when rendering
        map[update.name].push(update.description ?? '')
    }
    return map
}

export function getJobStatisticsHtml(jobStatistics: any) {
    let htmlString = ''
    if (jobStatistics.length === 0) {
        return htmlString
    }
    htmlString += `<div style="flex: 1; margin-left: 20px; border: 1px solid #424750; border-radius: 8px; padding: 10px;">`
    // eslint-disable-next-line unicorn/no-array-for-each
    jobStatistics.forEach((stat: { name: string; value: string }) => {
        htmlString += `<p style="margin-bottom: 4px"><img src="${getTransformationIcon(
            stat.name
        )}" style="vertical-align: middle;"> ${getFormattedString(stat.name)}: ${stat.value}</p>`
    })
    htmlString += `</div>`
    return htmlString
}

export async function getTransformationPlan(jobId: string, profile: RegionProfile | undefined) {
    let response = undefined
    try {
        response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
            transformationJobId: jobId,
            profileArn: profile?.arn,
        })

        const stepZeroProgressUpdates = response.transformationPlan.transformationSteps[0].progressUpdates

        if (!stepZeroProgressUpdates || stepZeroProgressUpdates.length === 0) {
            // means backend API response wrong and table data is missing
            throw new Error('No progress updates found in step 0')
        }

        // gets a mapping between the ID ('name' field) of each progressUpdate (substep) and the associated table
        const tableMapping = getTableMapping(stepZeroProgressUpdates)

        const jobStatistics = JSON.parse(tableMapping['0'][0]).rows // ID of '0' reserved for job statistics table; only 1 table there

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
        for (const step of response.transformationPlan.transformationSteps.slice(1)) {
            plan += `<div style="border: 1px solid #424750; border-radius: 8px; padding: 20px;"><div style="display:flex; justify-content:space-between; align-items:center;"><p style="font-size: 16px; margin-bottom: 4px;">${step.name}</p><a href="#top">Scroll to top <img src="${arrowIcon}" style="vertical-align: middle"></a></div><p>${step.description}</p>`
            plan = addTableMarkdown(plan, step.id, tableMapping)
            plan += `</div><br>`
        }
        plan += `</div><br>`
        plan += `<p style="font-size: 18px; margin-bottom: 4px;"><b>Appendix</b><br><a href="#top" style="float: right; font-size: 14px;">Scroll to top <img src="${arrowIcon}" style="vertical-align: middle;"></a></p><br>`
        plan = addTableMarkdown(plan, '-1', tableMapping) // ID of '-1' reserved for appendix table; only 1 table there
        return plan
    } catch (e: any) {
        const errorMessage = (e as Error).message
        transformByQState.setJobFailureMetadata(` (request ID: ${e.requestId ?? 'unavailable'})`)
        getLogger().error(`CodeTransformation: GetTransformationPlan error = %O`, e)

        /* Means API call failed
         * If response is defined, means a display/parsing error occurred, so continue transformation
         */
        if (response === undefined) {
            throw new Error(errorMessage)
        }
    }
}

export async function getTransformationSteps(jobId: string, profile: RegionProfile | undefined) {
    try {
        const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
            transformationJobId: jobId,
            profileArn: profile?.arn,
        })
        return response.transformationPlan.transformationSteps.slice(1) // skip step 0 (contains supplemental info)
    } catch (e: any) {
        transformByQState.setJobFailureMetadata(` (request ID: ${e.requestId ?? 'unavailable'})`)
        getLogger().error(`CodeTransformation: GetTransformationPlan error = %O`, e)
        throw e
    }
}

export async function pollTransformationJob(jobId: string, validStates: string[], profile: RegionProfile | undefined) {
    let status: string = ''
    let isPlanComplete = false
    while (true) {
        throwIfCancelled()
        try {
            const response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformation({
                transformationJobId: jobId,
                profileArn: profile?.arn,
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
            getLogger().info(`CodeTransformation: polled job status = ${status}`)

            const errorMessage = response.transformationJob.reason
            if (errorMessage !== undefined) {
                getLogger().error(
                    `CodeTransformation: GetTransformation returned transformation error reason = ${errorMessage}`
                )
                transformByQState.setJobFailureErrorChatMessage(
                    `${CodeWhispererConstants.failedToCompleteJobGenericChatMessage} ${errorMessage}`
                )
                transformByQState.setJobFailureErrorNotification(
                    `${CodeWhispererConstants.failedToCompleteJobGenericNotification} ${errorMessage}`
                )
            }

            if (
                CodeWhispererConstants.validStatesForPlanGenerated.includes(status) &&
                transformByQState.getTransformationType() === TransformationType.LANGUAGE_UPGRADE &&
                !isPlanComplete
            ) {
                const plan = await openTransformationPlan(jobId, profile)
                if (plan?.toLowerCase().includes('dependency changes')) {
                    // final plan is complete; show to user
                    isPlanComplete = true
                }
            }

            if (validStates.includes(status)) {
                break
            }

            // TO-DO: remove isClientSideBuildEnabled when releasing CSB
            if (
                isClientSideBuildEnabled &&
                status === 'TRANSFORMING' &&
                transformByQState.getTransformationType() === TransformationType.LANGUAGE_UPGRADE
            ) {
                // client-side build is N/A for SQL conversions
                await attemptLocalBuild()
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
                throw new JobStoppedError()
            }
            await sleep(CodeWhispererConstants.transformationJobPollingIntervalSeconds * 1000)
        } catch (e: any) {
            getLogger().error(`CodeTransformation: GetTransformation error = %O`, e)
            transformByQState.setJobFailureMetadata(` (request ID: ${e.requestId ?? 'unavailable'})`)
            throw e
        }
    }
    return status
}

async function openTransformationPlan(jobId: string, profile?: RegionProfile) {
    let plan = undefined
    try {
        plan = await getTransformationPlan(jobId, profile)
    } catch (error) {
        // means API call failed
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`, error)
        transformByQState.setJobFailureErrorNotification(
            `${CodeWhispererConstants.failedToGetPlanNotification} ${(error as Error).message}`
        )
        transformByQState.setJobFailureErrorChatMessage(
            `${CodeWhispererConstants.failedToGetPlanChatMessage} ${(error as Error).message}`
        )
        throw new Error('Get plan failed')
    }

    if (plan) {
        const planFilePath = path.join(transformByQState.getProjectPath(), 'transformation-plan.md')
        nodefs.writeFileSync(planFilePath, plan)
        await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(planFilePath))
        transformByQState.setPlanFilePath(planFilePath)
        await setContext('gumby.isPlanAvailable', true)
    }
    return plan
}

async function attemptLocalBuild() {
    const jobId = transformByQState.getJobId()
    let artifactId
    try {
        artifactId = await getClientInstructionArtifactId(jobId)
        getLogger().info(`CodeTransformation: found artifactId = ${artifactId}`)
    } catch (e: any) {
        // don't throw error so that we can try to get progress updates again in next polling cycle
        getLogger().error(`CodeTransformation: failed to get client instruction artifact ID = %O`, e)
    }
    if (artifactId) {
        const clientInstructionsPath = await downloadClientInstructions(jobId, artifactId)
        getLogger().info(
            `CodeTransformation: downloaded clientInstructions with diff.patch at: ${clientInstructionsPath}`
        )
        await processClientInstructions(jobId, clientInstructionsPath, artifactId)
    }
}

async function getClientInstructionArtifactId(jobId: string) {
    const steps = await getTransformationSteps(jobId, AuthUtil.instance.regionProfileManager.activeRegionProfile)
    const progressUpdate = findDownloadArtifactProgressUpdate(steps)

    let artifactId = undefined
    if (progressUpdate?.downloadArtifacts) {
        artifactId = progressUpdate.downloadArtifacts[0].downloadArtifactId
    }
    return artifactId
}

async function downloadClientInstructions(jobId: string, artifactId: string) {
    const exportDestination = `downloadClientInstructions_${jobId}_${artifactId}`
    const exportZipPath = path.join(os.tmpdir(), exportDestination)

    const exportContext: ExportContext = {
        transformationExportContext: {
            downloadArtifactType: TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS,
            downloadArtifactId: artifactId,
        },
    }

    await downloadAndExtractResultArchive(jobId, exportZipPath, exportContext)
    return path.join(exportZipPath, 'diff.patch')
}

async function processClientInstructions(jobId: string, clientInstructionsPath: any, artifactId: string) {
    const destinationPath = path.join(os.tmpdir(), `originalCopy_${jobId}_${artifactId}`)
    await extractOriginalProjectSources(destinationPath)
    getLogger().info(`CodeTransformation: copied project to ${destinationPath}`)
    const diffModel = new DiffModel()
    diffModel.parseDiff(clientInstructionsPath, path.join(destinationPath, 'sources'), true)
    // show user the diff.patch
    const doc = await vscode.workspace.openTextDocument(clientInstructionsPath)
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One })
    await runClientSideBuild(transformByQState.getProjectCopyFilePath(), artifactId)
}

export async function runClientSideBuild(projectCopyPath: string, clientInstructionArtifactId: string) {
    const baseCommand = transformByQState.getMavenName()
    const args = []
    if (transformByQState.getCustomBuildCommand() === CodeWhispererConstants.skipUnitTestsBuildCommand) {
        args.push('test-compile')
    } else {
        args.push('test')
    }
    const environment = { ...process.env, JAVA_HOME: transformByQState.getTargetJavaHome() }

    const argString = args.join(' ')
    const spawnResult = spawnSync(baseCommand, args, {
        cwd: projectCopyPath,
        shell: true,
        encoding: 'utf-8',
        env: environment,
    })

    const buildLogs = `Intermediate build result from running ${baseCommand} ${argString}:\n\n${spawnResult.stdout}`
    transformByQState.clearBuildLog()
    transformByQState.appendToBuildLog(buildLogs)
    await writeAndShowBuildLogs()

    const uploadZipBaseDir = path.join(
        os.tmpdir(),
        `clientInstructionsResult_${transformByQState.getJobId()}_${clientInstructionArtifactId}`
    )
    const uploadZipPath = await createLocalBuildUploadZip(uploadZipBaseDir, spawnResult.status, spawnResult.stdout)

    // upload build results
    const uploadContext: UploadContext = {
        transformationUploadContext: {
            jobId: transformByQState.getJobId(),
            uploadArtifactType: 'ClientBuildResult',
        },
    }
    getLogger().info(`CodeTransformation: uploading client build results at ${uploadZipPath} and resuming job now`)
    try {
        await uploadPayload(uploadZipPath, AuthUtil.instance.regionProfileManager.activeRegionProfile, uploadContext)
        await resumeTransformationJob(transformByQState.getJobId(), 'COMPLETED')
    } finally {
        await fs.delete(projectCopyPath, { recursive: true })
        await fs.delete(uploadZipBaseDir, { recursive: true })
        getLogger().info(`CodeTransformation: Just deleted project copy and uploadZipBaseDir after client-side build`)
    }
}

export function getArtifactsFromProgressUpdate(progressUpdate: TransformationProgressUpdate) {
    const artifactType = progressUpdate?.downloadArtifacts?.[0]?.downloadArtifactType
    const artifactId = progressUpdate?.downloadArtifacts?.[0]?.downloadArtifactId
    return {
        artifactId,
        artifactType,
    }
}

// used for client-side build
export function findDownloadArtifactProgressUpdate(transformationSteps: TransformationSteps) {
    return transformationSteps
        .flatMap((step) => step.progressUpdates ?? [])
        .find(
            (update) => update.status === 'AWAITING_CLIENT_ACTION' && update.downloadArtifacts?.[0]?.downloadArtifactId
        )
}

// used for HIL
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

export async function downloadResultArchive(jobId: string, pathToArchive: string, exportContext?: ExportContext) {
    const cwStreamingClient = await createCodeWhispererChatStreamingClient()

    try {
        const args = exportContext
            ? {
                  exportId: jobId,
                  exportIntent: ExportIntent.TRANSFORMATION,
                  exportContext: exportContext,
              }
            : {
                  exportId: jobId,
                  exportIntent: ExportIntent.TRANSFORMATION,
              }
        await downloadExportResultArchive(
            cwStreamingClient,
            args,
            pathToArchive,
            AuthUtil.instance.regionProfileManager.activeRegionProfile
        )
    } catch (e: any) {
        getLogger().error(`CodeTransformation: ExportResultArchive error = %O`, e)
        throw e
    } finally {
        cwStreamingClient.destroy()
        UserWrittenCodeTracker.instance.onQFeatureInvoked()
    }
}

export async function downloadAndExtractResultArchive(
    jobId: string,
    pathToArchiveDir: string,
    exportContext?: ExportContext
) {
    const archivePathExists = await fs.existsDir(pathToArchiveDir)
    if (!archivePathExists) {
        await fs.mkdir(pathToArchiveDir)
    }

    const pathToArchive = path.join(pathToArchiveDir, 'ExportResultsArchive.zip')

    let downloadErrorMessage = undefined
    try {
        // Download and deserialize the zip
        await downloadResultArchive(jobId, pathToArchive, exportContext)
        const zip = new AdmZip(pathToArchive)
        zip.extractAllTo(pathToArchiveDir)
        getLogger().info(`CodeTransformation: downloaded result archive to: ${pathToArchiveDir}`)
    } catch (e) {
        downloadErrorMessage = (e as Error).message
        getLogger().error(`CodeTransformation: ExportResultArchive error = %O`, e)
        throw new Error('Error downloading transformation result artifacts: ' + downloadErrorMessage)
    }
}

export async function downloadHilResultArchive(jobId: string, downloadArtifactId: string, pathToArchiveDir: string) {
    await downloadAndExtractResultArchive(jobId, pathToArchiveDir)

    // manifest.json
    // pomFolder/pom.xml or manifest has pomFolderName path
    const manifestFileVirtualFileReference = vscode.Uri.file(path.join(pathToArchiveDir, 'manifest.json'))
    const pomFileVirtualFileReference = vscode.Uri.file(path.join(pathToArchiveDir, 'pomFolder', 'pom.xml'))
    return { manifestFileVirtualFileReference, pomFileVirtualFileReference }
}
