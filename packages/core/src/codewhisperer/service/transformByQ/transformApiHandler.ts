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
    sessionPlanProgress,
    StepProgress,
    transformByQState,
    TransformByQStoppedError,
    ZipManifest,
} from '../../models/model'
import { getLogger } from '../../../shared/logger'
import { CreateUploadUrlResponse } from '../../client/codewhispereruserclient'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import AdmZip from 'adm-zip'
import globals from '../../../shared/extensionGlobals'
import { CredentialSourceId, telemetry } from '../../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency } from '../../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import request from '../../../common/request'
import { ZipExceedsSizeLimitError } from '../../../amazonqGumby/errors'
import { writeLogs } from './transformFileHandler'
import { AuthUtil } from '../../util/authUtil'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'

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

        tempFilePath = path.join(os.tmpdir(), 'zipped-code.zip')
        fs.writeFileSync(tempFilePath, zip.toBuffer())
        if (fs.existsSync(dependenciesFolder.path)) {
            fs.rmSync(dependenciesFolder.path, { recursive: true, force: true })
        }
        fs.rmSync(logFilePath) // will always exist here
    } catch (e: any) {
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
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
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
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
export function getIcon(iconName: string) {
    let iconPath = iconName
    const themeColor = vscode.window.activeColorTheme.kind
    if (themeColor === vscode.ColorThemeKind.Light || themeColor === vscode.ColorThemeKind.HighContrastLight) {
        iconPath += '-light.svg'
    } else {
        iconPath += '-dark.svg'
    }
    return getImageAsBase64(globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'amazonq', iconPath)))
}

export function addTableMarkdown(plan: string, tableObj: any) {
    plan += `\n\n\n${tableObj.name}\n|`
    const table = JSON.parse(tableObj.description)
    const columns = table.columnNames
    columns.forEach((columnName: string) => {
        plan += ` ${columnName} |`
    })
    plan += '\n|'
    columns.forEach((_: any) => {
        plan += '-----|'
    })
    table.rows.forEach((row: any) => {
        plan += '\n|'
        columns.forEach((columnName: string) => {
            if (columnName === 'File name') {
                plan += ` [${row[columnName]}](${row[columnName]}) |` // add MD link only for files
            } else {
                plan += ` ${row[columnName]} |`
            }
        })
    })
    plan += '\n\n'
    return plan
}

export async function getTransformationPlan(jobId: string) {
    console.log('calling getPlan!')
    let response = undefined
    try {
        // response = await codeWhisperer.codeWhispererClient.codeModernizerGetCodeTransformationPlan({
        //     transformationJobId: jobId,
        // })
        // const apiStartTime = Date.now()
        // if (response.$response.requestId) {
        //     transformByQState.setJobFailureMetadata(` (request ID: ${response.$response.requestId})`)
        // }
        // telemetry.codeTransform_logApiLatency.emit({
        //     codeTransformApiNames: 'GetTransformationPlan',
        //     codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        //     codeTransformJobId: jobId,
        //     codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
        //     codeTransformRequestId: response.$response.requestId,
        //     result: MetadataResult.Pass,
        // })

        response = {
            transformationPlan: {
                transformationSteps: [
                    {
                        id: '0_SupplementInfo',
                        name: 'Supplemental info',
                        description: 'Supplemental info',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                name: 'Job statistics',
                                status: 'COMPLETED',
                                description:
                                    '{"columnNames":["Name","Value"],"rows":[{"Name":"Lines of code in your application","Value":"3000"},{"Name":"Dependencies to be replaced","Value":"5"},{"Name":"Deprecated code instances to be replaced","Value":"10"},{"Name":"Files to be updated","Value":"7"}]}',
                            },
                            {
                                name: 'Dependency changes (2)',
                                status: 'COMPLETED',
                                description:
                                    '{"columnNames":["Dependency","Action","Current version","Target version"],"rows":[{"Dependency":"org.springboot.com","Action":"Update","Current version":"2.1","Target version":"2.4"}, {"Dependency":"com.lombok.java","Action":"Remove","Current version":"1.7","Target version":"-"}]}',
                            },
                            {
                                name: 'Deprecated code changes (2)',
                                status: 'COMPLETED',
                                description:
                                    '{"columnNames":["Deprecated code","Suggested replacement","Files to be changed"],"rows":[{"Deprecated code":"java.lang.Thread.stop()","Suggested replacement":"java.lang.Thread.alternative()","Files to be changed":"6"}, {"Deprecated code":"java.math.bad()","Suggested replacement":"java.math.good()","Files to be changed":"3"}]}',
                            },
                            {
                                name: 'Files to be changed (2)',
                                status: 'COMPLETED',
                                description:
                                    '{"columnNames":["File name","Action"],"rows":[{"File name":"pom.xml","Action":"Update"}, {"File name":"src/main/java/com/bhoruka/bloodbank/BloodbankApplication.java","Action":"Update"}]}',
                            },
                        ],
                    },
                    {
                        id: '1_OpenRewriteAndPythonDepKnowledge_V1',
                        name: 'Step 1: Update JDK version, dependencies, and related code',
                        description:
                            'Amazon Q will attempt to update the JDK version and change the following dependencies and related code.',
                        status: 'COMPLETED',
                    },
                    {
                        id: '2_UpdateDeprecatedAPI',
                        name: 'Step 2: Update deprecated code',
                        description: 'Amazon Q will attempt to replace the following instances of deprecated code.',
                        status: 'COMPLETED',
                    },
                    {
                        id: '3_PythonErrorsKnowledgeAndLlmDebugPom_V1',
                        name: 'Step 3: Build in Java 17 and fix any issues',
                        description:
                            'Amazon Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        status: 'COMPLETED',
                    },
                    {
                        id: '4_PassThroughValidation_V2',
                        name: 'Step 4: Finalize code changes and generate transformation summary',
                        description:
                            'Amazon Q will generate code changes for you to review and accept. It will also summarize the changes made and will copy over build logs for future reference and troubleshooting.',
                        status: 'COMPLETED',
                    },
                ],
            },
        }

        // console.log("response = " + JSON.stringify(response))

        const progressUpdates = response.transformationPlan.transformationSteps[0].progressUpdates

        if (!progressUpdates || !progressUpdates[0].description) {
            throw new Error('Null or incomplete progress updates found in step 0') // means backend API response wrong
        }

        // handle these 4 statistics manually since there are specific icons to display next to each one
        const jobStatistics = JSON.parse(progressUpdates[0].description).rows

        // get logo directly since we only use one logo regardless of color theme
        const logoIcon = getImageAsBase64(
            globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'amazonq', 'transform-logo.svg'))
        )

        const clockIcon = getIcon('transform-clock')
        const dependenciesIcon = getIcon('transform-dependencies')
        const stepIntoIcon = getIcon('transform-step-into')
        const fileIcon = getIcon('transform-file')
        const arrowIcon = getIcon('transform-arrow')

        let plan = `<style>table {border: 1px solid grey;}</style>\n\n<a id="top"></a><br><p style="font-size: 32px"><img src="${logoIcon}" style="margin-right: 15px"></img><b>${CodeWhispererConstants.planTitle}</b></p><br>`
        plan += `<div style="display: flex;">
            <div style="flex: 1; border: 1px solid grey; border-radius: 10px; padding: 10px;">
                <p>${CodeWhispererConstants.planIntroductionMessage}</p>
            </div>
            <div style="flex: 1; margin-left: 20px; border: 1px solid grey; border-radius: 10px; padding: 10px;">
                <p><img src="${clockIcon}"> ${jobStatistics[0].Name}: ${jobStatistics[0].Value ?? '-'}</p>
                <p><img src="${dependenciesIcon}"> ${jobStatistics[1].Name}: ${jobStatistics[1].Value ?? '-'}</p>
                <p><img src="${stepIntoIcon}"> ${jobStatistics[2].Name}: ${jobStatistics[2].Value ?? '-'}</p>
                <p><img src="${fileIcon}"> ${jobStatistics[3].Name}: ${jobStatistics[3].Value ?? '-'}</p>
            </div>
        </div>`
        plan += `<div style="margin-top: 20px; border: 1px solid grey; border-radius: 10px; padding: 10px;"><p style="font-size: 21px"><b>${CodeWhispererConstants.planHeaderMessage}</b></p><i>${CodeWhispererConstants.planDisclaimerMessage} <a href="https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/code-transformation.html">Read more.</a></i><br><br>`
        response.transformationPlan.transformationSteps.slice(1).forEach((step, index) => {
            plan += `<div style="border: 1px solid grey; border-radius: 10px; padding: 10px;"><div style="display:flex; justify-content:space-between; align-items:center;"><p style="font-size: 18px">${step.name}</p><a href="#top">Scroll to top <img src="${arrowIcon}"></a></div><p>${step.description}</p>`
            if (index === 0) {
                plan = addTableMarkdown(plan, progressUpdates[1]) // add the dependency changes table in step 1
            } else if (index === 1) {
                plan = addTableMarkdown(plan, progressUpdates[2]) // add the deprecated code table in step 2
            }
            plan += `</div><br>`
        })
        plan += `</div><br><p style="font-size: 21px"><b>Appendix</b><br><a href="#top" style="float: right; font-size: 14px;">Scroll to top <img src="${arrowIcon}"></a></p>`
        plan = addTableMarkdown(plan, progressUpdates[3]) // add the files changed table in appendix
        return plan
    } catch (e: any) {
        console.log('getPlan error = ' + e)
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

        /* Means API call failed
         *  If reponse is defined, means a display/parsing error occurred, so continue transformation
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
            console.log('status = ' + status)
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
