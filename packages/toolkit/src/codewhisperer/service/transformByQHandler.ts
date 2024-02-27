/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BuildSystem, JDKVersion, transformByQState, TransformByQStoppedError, ZipManifest } from '../models/model'
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
import { spawnSync } from 'child_process' // TO-DO: consider using ChildProcess once we finalize all spawnSync calls
import AdmZip from 'adm-zip'
import globals from '../../shared/extensionGlobals'
import { CodeTransformMavenBuildCommand, telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import { codeTransformTelemetryState } from '../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency, javapOutputToTelemetryValue } from '../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'
import request from '../../common/request'

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
        void vscode.window.showErrorMessage(CodeWhispererConstants.noSupportedJavaProjectsFoundMessage)
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

async function getJavaProjects(projects: vscode.QuickPickItem[]) {
    const javaProjects = []
    for (const project of projects) {
        const projectPath = project.description
        const javaFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectPath!, '**/*.java'),
            '**/node_modules/**',
            1
        )
        if (javaFiles.length > 0) {
            javaProjects.push(project)
        }
    }
    return javaProjects
}

async function getMavenJavaProjects(javaProjects: vscode.QuickPickItem[]) {
    const mavenJavaProjects = []
    for (const project of javaProjects) {
        const projectPath = project.description
        const buildSystem = await checkBuildSystem(projectPath!)
        if (buildSystem === BuildSystem.Maven) {
            mavenJavaProjects.push(project)
        }
    }
    return mavenJavaProjects
}

async function getProjectsValidToTransform(mavenJavaProjects: vscode.QuickPickItem[]) {
    const projectsValidToTransform = new Map<vscode.QuickPickItem, JDKVersion | undefined>()
    for (const project of mavenJavaProjects) {
        let detectedJavaVersion = undefined
        const projectPath = project.description
        const compiledJavaFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectPath!, '**/*.class'),
            '**/node_modules/**',
            1
        )
        if (compiledJavaFiles.length > 0) {
            const classFilePath = `${compiledJavaFiles[0].fsPath}`
            const baseCommand = 'javap'
            const args = ['-v', classFilePath]
            const spawnResult = spawnSync(baseCommand, args, { shell: false, encoding: 'utf-8' })
            if (spawnResult.status !== 0) {
                let errorLog = ''
                errorLog += spawnResult.error ? JSON.stringify(spawnResult.error) : ''
                errorLog += `${spawnResult.stderr}\n${spawnResult.stdout}`
                getLogger().error(`CodeTransformation: Error in running javap command = ${errorLog}`)
                let errorReason = ''
                if (spawnResult.stdout) {
                    errorReason = 'JavapExecutionError'
                    // should never happen -- stdout from javap has always been much, much smaller than the default buffer limit of 1MB
                    if (Buffer.byteLength(spawnResult.stdout, 'utf-8') > CodeWhispererConstants.maxBufferSize) {
                        errorReason += '-BufferOverflow'
                    }
                } else {
                    errorReason = 'JavapSpawnError'
                }
                if (spawnResult.error) {
                    const errorCode = (spawnResult.error as any).code ?? 'UNKNOWN'
                    errorReason += `-${errorCode}`
                }
                telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformPreValidationError: 'NoJavaProject',
                    codeTransformRuntimeError: errorReason,
                    result: MetadataResult.Fail,
                    reason: 'CannotDetermineJavaVersion',
                })
            } else {
                const majorVersionIndex = spawnResult.stdout.indexOf('major version: ')
                const javaVersion = spawnResult.stdout.slice(majorVersionIndex + 15, majorVersionIndex + 17).trim()
                if (javaVersion === CodeWhispererConstants.JDK8VersionNumber) {
                    detectedJavaVersion = JDKVersion.JDK8
                } else if (javaVersion === CodeWhispererConstants.JDK11VersionNumber) {
                    detectedJavaVersion = JDKVersion.JDK11
                } else {
                    detectedJavaVersion = JDKVersion.UNSUPPORTED
                    telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
                        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                        codeTransformPreValidationError: 'UnsupportedJavaVersion',
                        result: MetadataResult.Fail,
                        reason: javapOutputToTelemetryValue(javaVersion),
                    })
                }
            }
        }
        // detectedJavaVersion will be undefined if there are no .class files or if javap errors out, otherwise it will be JDK8, JDK11, or UNSUPPORTED
        projectsValidToTransform.set(project, detectedJavaVersion)
    }
    return projectsValidToTransform
}

/*
 * This function filters all open projects by first searching for a .java file and then searching for a pom.xml file in all projects.
 * It also tries to detect the Java version of each project by running "javap" on a .class file of each project.
 * As long as the project contains a .java file and a pom.xml file, the project is still considered valid for transformation,
 * and we allow the user to specify the Java version.
 */
export async function validateOpenProjects(projects: vscode.QuickPickItem[]) {
    const javaProjects = await getJavaProjects(projects)
    if (javaProjects.length === 0) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.noSupportedJavaProjectsFoundMessage)
        telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformPreValidationError: 'NoJavaProject',
            result: MetadataResult.Fail,
            reason: 'CouldNotFindJavaProject',
        })
        throw new ToolkitError('No Java projects found', { code: 'CouldNotFindJavaProject' })
    }
    const mavenJavaProjects = await getMavenJavaProjects(javaProjects)
    if (mavenJavaProjects.length === 0) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.noPomXmlFoundMessage)
        telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformPreValidationError: 'NonMavenProject',
            result: MetadataResult.Fail,
            reason: 'NoPomFileFound',
        })
        throw new ToolkitError('No valid Maven build file found', { code: 'CouldNotFindPomXml' })
    }

    /*
     * these projects we know must contain a pom.xml and a .java file
     * here we try to get the Java version of each project so that we
     * can pre-select a default version in the QuickPick for them
     */
    const projectsValidToTransform = await getProjectsValidToTransform(mavenJavaProjects)
    return projectsValidToTransform
}

export function getSha256(fileName: string) {
    const hasher = crypto.createHash('sha256')
    hasher.update(fs.readFileSync(fileName))
    return hasher.digest('base64')
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

// TODO: later, consider enhancing the S3 client to include this functionality
export async function uploadArtifactToS3(fileName: string, resp: CreateUploadUrlResponse) {
    const sha256 = getSha256(fileName)
    const headersObj = getHeadersObj(sha256, resp.kmsKeyArn)

    throwIfCancelled()
    try {
        const apiStartTime = Date.now()
        const response = await request.fetch('PUT', resp.uploadUrl, {
            body: fs.readFileSync(fileName),
            headers: headersObj,
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
                    result: MetadataResult.Pass,
                })
                // always store request ID, but it will only show up in a notification if an error occurs
                if (response.$response.requestId) {
                    transformByQState.setJobFailureMetadata(`(request ID: ${response.$response.requestId})`)
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
            throw new ToolkitError(errorMessage, { cause: e as Error })
        }
    }
}

export async function uploadPayload(payloadFileName: string) {
    const sha256 = getSha256(payloadFileName)
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
            transformByQState.setJobFailureMetadata(`(request ID: ${response.$response.requestId})`)
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
        // Pass along error to callee function
        throw new ToolkitError(errorMessage, { cause: e as Error })
    }
    try {
        await uploadArtifactToS3(payloadFileName, response)
    } catch (e: any) {
        const errorMessage = (e as Error).message ?? 'Error in uploadArtifactToS3 call'
        getLogger().error(`CodeTransformation: UploadArtifactToS3 error: = ${errorMessage}`)
        throw new ToolkitError(errorMessage, { cause: e as Error })
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

// run 'install' with either 'mvnw.cmd', './mvnw', or 'mvn' (if wrapper exists, we use that, otherwise we use regular 'mvn')
function installProjectDependencies() {
    // baseCommand will be one of: '.\mvnw.cmd', './mvnw', 'mvn'
    const baseCommand = transformByQState.getMavenName()
    const modulePath = transformByQState.getProjectPath()

    transformByQState.appendToErrorLog(`Running command ${baseCommand} clean install`)

    // Note: IntelliJ runs 'clean' separately from 'install'. Evaluate benefits (if any) of this.
    const args = ['clean', 'install', '-q']
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
    })
    if (spawnResult.status !== 0) {
        let errorLog = ''
        errorLog += spawnResult.error ? JSON.stringify(spawnResult.error) : ''
        errorLog += `${spawnResult.stderr}\n${spawnResult.stdout}`
        transformByQState.appendToErrorLog(`${baseCommand} clean install failed: \n ${errorLog}`)
        getLogger().error(`CodeTransformation: Error in running Maven install command ${baseCommand} = ${errorLog}`)
        let errorReason = ''
        if (spawnResult.stdout) {
            errorReason = 'Maven Install: InstallExecutionError'
            /*
             * adding this check here because these mvn commands sometimes generate a lot of output.
             * rarely, a buffer overflow has resulted when these mvn commands are run with -X, -e flags
             * which are not being used here (for now), but still keeping this just in case.
             */
            if (Buffer.byteLength(spawnResult.stdout, 'utf-8') > CodeWhispererConstants.maxBufferSize) {
                errorReason += '-BufferOverflow'
            }
        } else {
            errorReason = 'Maven Install: InstallSpawnError'
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
        throw new ToolkitError('Maven install error', { code: 'MavenInstallError' })
    } else {
        transformByQState.appendToErrorLog(`${baseCommand} clean install succeeded`)
    }
}

function copyProjectDependencies(): string[] {
    // Make temp directory
    const folderName = `${CodeWhispererConstants.dependencyFolderName}${Date.now()}`
    const folderPath = path.join(os.tmpdir(), folderName)

    // baseCommand will be one of: '.\mvnw.cmd', './mvnw', 'mvn'
    const baseCommand = transformByQState.getMavenName()
    const modulePath = transformByQState.getProjectPath()

    transformByQState.appendToErrorLog(`Running command ${baseCommand} copy-dependencies`)

    const args = [
        'dependency:copy-dependencies',
        '-DoutputDirectory=' + folderPath,
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
        throw new ToolkitError('Maven copy dependencies error', { code: 'MavenCopyDependenciesError' })
    } else {
        transformByQState.appendToErrorLog(`${baseCommand} copy-dependencies succeeded`)
    }

    return [folderPath, folderName]
}

export async function writeLogs() {
    const logFilePath = path.join(os.tmpdir(), 'build-logs.txt')
    const content = `${CodeWhispererConstants.buildLogsDocumentationMessage}\n\n${transformByQState.getErrorLog()}`
    fs.writeFileSync(logFilePath, content)
    return logFilePath
}

export async function zipCode() {
    const modulePath = transformByQState.getProjectPath()
    throwIfCancelled()
    const zipStartTime = Date.now()
    const sourceFolder = modulePath
    const sourceFiles = getFilesRecursively(sourceFolder, false)

    try {
        installProjectDependencies()
    } catch (err) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.installErrorMessage)
        // open build-logs.txt file to show user error logs
        const logFilePath = await writeLogs()
        const doc = await vscode.workspace.openTextDocument(logFilePath)
        await vscode.window.showTextDocument(doc)
        throw err
    }

    throwIfCancelled()

    let dependencyFolderInfo: string[] = []
    try {
        dependencyFolderInfo = copyProjectDependencies()
    } catch (err) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.dependencyErrorMessage)
        // open build-logs.txt file to show user error logs
        const logFilePath = await writeLogs()
        const doc = await vscode.workspace.openTextDocument(logFilePath)
        await vscode.window.showTextDocument(doc)
        throw err
    }

    const dependencyFolderPath = dependencyFolderInfo[0]
    const dependencyFolderName = dependencyFolderInfo[1]

    throwIfCancelled()

    const zip = new AdmZip()
    const zipManifest = new ZipManifest()

    for (const file of sourceFiles) {
        const relativePath = path.relative(sourceFolder, file)
        const paddedPath = path.join('sources', relativePath)
        zip.addLocalFile(file, path.dirname(paddedPath))
    }

    throwIfCancelled()

    let dependencyFiles: string[] = []
    if (fs.existsSync(dependencyFolderPath)) {
        dependencyFiles = getFilesRecursively(dependencyFolderPath, true)
    }

    if (dependencyFiles.length > 0) {
        for (const file of dependencyFiles) {
            const relativePath = path.relative(dependencyFolderPath, file)
            const paddedPath = path.join(`dependencies/${dependencyFolderName}`, relativePath)
            zip.addLocalFile(file, path.dirname(paddedPath))
        }
        zipManifest.dependenciesRoot += `${dependencyFolderName}/`
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
    if (fs.existsSync(dependencyFolderPath)) {
        fs.rmSync(dependencyFolderPath, { recursive: true, force: true })
    }
    fs.rmSync(logFilePath) // will always exist here

    const zipSize = (await fs.promises.stat(tempFilePath)).size

    // Later, consider adding field for number of source lines of code
    telemetry.codeTransform_jobCreateZipEndTime.emit({
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        codeTransformTotalByteSize: zipSize,
        codeTransformRunTimeLatency: calculateTotalLatency(zipStartTime),
        result: MetadataResult.Pass,
    })

    if (zipSize > CodeWhispererConstants.uploadZipSizeLimitInBytes) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.projectSizeTooLargeMessage)
        throw new Error('Project size exceeds 1GB limit')
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
            transformByQState.setJobFailureMetadata(`(request ID: ${response.$response.requestId})`)
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
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(`(request ID: ${response.$response.requestId})`)
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
        if (response.$response.requestId) {
            transformByQState.setJobFailureMetadata(`(request ID: ${response.$response.requestId})`)
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
            // emit metric when job status changes
            if (status !== transformByQState.getPolledJobStatus()) {
                telemetry.codeTransform_jobStatusChanged.emit({
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: jobId,
                    codeTransformStatus: status,
                    result: MetadataResult.Pass,
                })
            }
            transformByQState.setPolledJobStatus(status)
            await vscode.commands.executeCommand('aws.amazonq.refresh')
            if (validStates.includes(status)) {
                break
            }
            if (CodeWhispererConstants.failureStates.includes(status)) {
                transformByQState.setJobFailureMetadata(
                    `${response.transformationJob.reason} (request ID: ${response.$response.requestId})`
                )
                throw new ToolkitError('Transformation job failed')
            }
            await sleep(CodeWhispererConstants.transformationJobPollingIntervalSeconds * 1000)
            timer += CodeWhispererConstants.transformationJobPollingIntervalSeconds
            if (timer > CodeWhispererConstants.transformationJobTimeoutSeconds) {
                throw new ToolkitError('Transformation job timed out')
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
            // Pass along error to callee function
            throw new ToolkitError(errorMessage, { cause: e as Error })
        }
    }
    return status
}

export async function checkBuildSystem(projectPath: string) {
    const mavenBuildFilePath = path.join(projectPath, 'pom.xml')
    if (fs.existsSync(mavenBuildFilePath)) {
        return BuildSystem.Maven
    }
    return BuildSystem.Unknown
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
