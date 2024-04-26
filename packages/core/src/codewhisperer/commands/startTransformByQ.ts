/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as os from 'os'
import path from 'path'
import { getLogger } from '../../shared/logger'
import * as CodeWhispererConstants from '../models/constants'
import {
    transformByQState,
    StepProgress,
    TransformByQReviewStatus,
    JDKVersion,
    sessionPlanProgress,
    FolderInfo,
    TransformationCandidateProject,
    ZipManifest,
} from '../models/model'
import {
    convertToTimeString,
    convertDateToTimestamp,
    getStringHash,
    encodeHTML,
} from '../../shared/utilities/textUtilities'
import {
    createZipManifest,
    downloadHilResultArchive,
    findDownloadArtifactStep,
    getArtifactsFromProgressUpdate,
    getTransformationPlan,
    getTransformationSteps,
    pollTransformationJob,
    resumeTransformationJob,
    startJob,
    stopJob,
    throwIfCancelled,
    uploadPayload,
    zipCode,
} from '../service/transformByQ/transformApiHandler'
import { getOpenProjects, validateOpenProjects } from '../service/transformByQ/transformProjectValidationHandler'
import {
    getVersionData,
    prepareProjectDependencies,
    runMavenDependencyUpdateCommands,
} from '../service/transformByQ/transformMavenHandler'
import {
    CodeTransformCancelSrcComponents,
    CodeTransformJavaSourceVersionsAllowed,
    CodeTransformJavaTargetVersionsAllowed,
    telemetry,
} from '../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../amazonqGumby/telemetry/codeTransformTelemetryState'
import {
    CancelActionPositions,
    JDKToTelemetryValue,
    calculateTotalLatency,
    telemetryUndefined,
} from '../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'
import { submitFeedback } from '../../feedback/vue/submitFeedback'
import { placeholder } from '../../shared/vscode/commands2'
import { AlternateDependencyVersionsNotFoundError, JavaHomeNotSetError } from '../../amazonqGumby/errors'
import { ChatSessionManager } from '../../amazonqGumby/chat/storages/chatSession'
import {
    createPomCopy,
    getCodeIssueSnippetFromPom,
    getDependenciesFolderInfo,
    getJsonValuesFromManifestFile,
    highlightPomIssueInProject,
    parseVersionsListFromPomFile,
    replacePomVersion,
    writeLogs,
} from '../service/transformByQ/transformFileHandler'
import { sleep } from '../../shared/utilities/timeoutUtils'
import DependencyVersions from '../../amazonqGumby/models/dependencies'
import { IManifestFile } from '../../amazonqFeatureDev/models'
import { dependencyNoAvailableVersions } from '../../amazonqGumby/models/constants'
import { fsCommon } from '../../srcShared/fs'

let sessionJobHistory: { timestamp: string; module: string; status: string; duration: string; id: string }[] = []
let pollUIIntervalId: string | number | NodeJS.Timer | undefined = undefined

export async function processTransformFormInput(
    pathToProject: string,
    fromJDKVersion: JDKVersion,
    toJDKVersion: JDKVersion
) {
    transformByQState.setProjectName(path.basename(pathToProject))
    transformByQState.setProjectPath(pathToProject)
    transformByQState.setSourceJDKVersion(fromJDKVersion)
    transformByQState.setTargetJDKVersion(toJDKVersion)
}

async function setMaven() {
    let mavenWrapperExecutableName = os.platform() === 'win32' ? 'mvnw.cmd' : 'mvnw'
    const mavenWrapperExecutablePath = path.join(transformByQState.getProjectPath(), mavenWrapperExecutableName)
    if (fs.existsSync(mavenWrapperExecutablePath)) {
        if (mavenWrapperExecutableName === 'mvnw') {
            mavenWrapperExecutableName = './mvnw' // add the './' for non-Windows
        } else if (mavenWrapperExecutableName === 'mvnw.cmd') {
            mavenWrapperExecutableName = '.\\mvnw.cmd' // add the '.\' for Windows
        }
        transformByQState.setMavenName(mavenWrapperExecutableName)
    } else {
        transformByQState.setMavenName('mvn')
    }
    getLogger().info(`CodeTransformation: using Maven ${transformByQState.getMavenName()}`)
}

async function validateJavaHome(): Promise<boolean> {
    const versionData = await getVersionData()
    let javaVersionUsedByMaven = versionData[1]
    if (javaVersionUsedByMaven !== undefined) {
        javaVersionUsedByMaven = javaVersionUsedByMaven.slice(0, 3)
        if (javaVersionUsedByMaven === '1.8') {
            javaVersionUsedByMaven = JDKVersion.JDK8
        } else if (javaVersionUsedByMaven === '11.') {
            javaVersionUsedByMaven = JDKVersion.JDK11
        }
    }
    if (javaVersionUsedByMaven !== transformByQState.getSourceJDKVersion()) {
        telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformPreValidationError: 'ProjectJDKDiffersFromMavenJDK',
            result: MetadataResult.Fail,
            reason: `${transformByQState.getSourceJDKVersion()} (project) - ${javaVersionUsedByMaven} (maven)`,
        })

        // means either javaVersionUsedByMaven is undefined or it does not match the project JDK
        return false
    }

    return true
}

export async function validateCanCompileProject() {
    await setMaven()
    const javaHomeFound = await validateJavaHome()
    if (!javaHomeFound) {
        throw new JavaHomeNotSetError()
    }
}

export async function compileProject() {
    try {
        const dependenciesFolder: FolderInfo = getDependenciesFolderInfo()
        transformByQState.setDependencyFolderInfo(dependenciesFolder)
        const modulePath = transformByQState.getProjectPath()
        await prepareProjectDependencies(dependenciesFolder, modulePath)
    } catch (err) {
        // open build-logs.txt file to show user error logs
        const logFilePath = await writeLogs()
        const doc = await vscode.workspace.openTextDocument(logFilePath)
        await vscode.window.showTextDocument(doc)
        throw err
    }
}

export async function startTransformByQ() {
    // Set the default state variables for our store and the UI
    await setTransformationToRunningState()

    try {
        // Set web view UI to poll for progress
        pollUIIntervalId = setInterval(() => {
            void vscode.commands.executeCommand(
                'aws.amazonq.showPlanProgressInHub',
                codeTransformTelemetryState.getStartTime()
            )
        }, CodeWhispererConstants.transformationJobPollingIntervalSeconds * 1000)

        // step 1: CreateCodeUploadUrl and upload code
        const uploadId = await preTransformationUploadCode()

        // step 2: StartJob and store the returned jobId in TransformByQState
        const jobId = await startTransformationJob(uploadId)

        // step 3 (intermediate step): show transformation-plan.md file
        await pollTransformationStatusUntilPlanReady(jobId)

        // step 4: poll until artifacts are ready to download
        await humanInTheLoopRetryLogic(jobId)
    } catch (error: any) {
        await transformationJobErrorHandler(error)
    } finally {
        if (transformByQState.isCancelled()) {
            await postTransformationJob()
            await cleanupTransformationJob()
        }
    }
}

/**
 *  The whileLoop condition WaitingUserInput is set inside pollTransformationStatusUntilComplete
 *  when we see a `PAUSED` state. If this is the case once completeHumanInTheLoopWork the
 *  WaitingUserInput should still be set until pollTransformationStatusUntilComplete is called again.
 *  We only don't want to continue calling pollTransformationStatusUntilComplete if there is no HIL
 *  state ever engaged or we have reached our max amount of HIL retries.
 */
export async function humanInTheLoopRetryLogic(jobId: string) {
    try {
        const status = await pollTransformationStatusUntilComplete(jobId)
        if (status === 'PAUSED') {
            const hilStatusFailure = await initiateHumanInTheLoopPrompt(jobId)
            if (hilStatusFailure) {
                // We rejected the changes and resumed the job and should
                // try to resume normal polling asynchronously
                void humanInTheLoopRetryLogic(jobId)
            }
        } else {
            await finalizeTransformByQ(status)
        }
    } catch (error) {
        // TODO if we encounter error in HIL, do we stop job?
        await finalizeTransformByQ(status)
        // bubble up error to callee function
        throw error
    }
}

export async function finalizeTransformByQ(status: string) {
    try {
        // Set the result state variables for our store and the UI
        await finalizeTransformationJob(status)
    } catch (error: any) {
        await transformationJobErrorHandler(error)
    } finally {
        await postTransformationJob()
        await cleanupTransformationJob()
    }
}

export async function preTransformationUploadCode() {
    await vscode.commands.executeCommand('aws.amazonq.refresh')
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.focus')

    void vscode.window.showInformationMessage(CodeWhispererConstants.jobStartedNotification)

    let uploadId = ''
    let payloadFilePath = ''
    throwIfCancelled()
    try {
        payloadFilePath = await zipCode({
            dependenciesFolder: transformByQState.getDependencyFolderInfo()!,
            modulePath: transformByQState.getProjectPath(),
            zipManifest: new ZipManifest(),
        })
        transformByQState.setPayloadFilePath(payloadFilePath)
        uploadId = await uploadPayload(payloadFilePath)
    } catch (err) {
        const errorMessage = `Failed to upload code due to ${(err as Error).message}`
        transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToUploadProjectNotification)
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToUploadProjectChatMessage)
        getLogger().error(errorMessage)
        throw err
    }

    await sleep(2000) // sleep before starting job to prevent ThrottlingException
    throwIfCancelled()

    return uploadId
}

//to-do: store this state somewhere
let PomFileVirtualFileReference: vscode.Uri
let manifestFileValues: IManifestFile
const osTmpDir = os.tmpdir()
const tmpDownloadsFolderName = 'q-hil-dependency-artifacts'
const tmpDependencyListFolderName = 'q-pom-dependency-list'
const userDependencyUpdateFolderName = 'q-pom-dependency-update'
const tmpDependencyListDir = path.join(osTmpDir, tmpDependencyListFolderName)
const userDependencyUpdateDir = path.join(osTmpDir, userDependencyUpdateFolderName)
const tmpDownloadsDir = path.join(osTmpDir, tmpDownloadsFolderName)
const pomReplacementDelimiter = '*****'
const diagnosticCollection = vscode.languages.createDiagnosticCollection('hilFileDiagnostics')
let newPomFileVirtualFileReference: vscode.Uri

export async function initiateHumanInTheLoopPrompt(jobId: string) {
    const localPathToXmlDependencyList = '/target/dependency-updates-aggregate-report.xml'
    try {
        // 1) We need to call GetTransformationPlan to get artifactId
        const transformationSteps = await getTransformationSteps(jobId, false)
        const { transformationStep, progressUpdate } = findDownloadArtifactStep(transformationSteps)

        if (!transformationStep || !progressUpdate) {
            throw new Error('No HIL Transformation Step found')
        }

        const { artifactId, artifactType } = getArtifactsFromProgressUpdate(progressUpdate)

        // Early exit safeguard incase artifactId or artifactType are undefined
        if (!artifactId || !artifactType) {
            throw new Error('artifactId or artifactType is undefined')
        }

        // 2) We need to call DownloadResultArchive to get the manifest and pom.xml
        const { pomFileVirtualFileReference, manifestFileVirtualFileReference } = await downloadHilResultArchive(
            jobId,
            artifactId,
            tmpDownloadsDir
        )
        PomFileVirtualFileReference = pomFileVirtualFileReference
        manifestFileValues = await getJsonValuesFromManifestFile(manifestFileVirtualFileReference)

        // 3) We need to replace version in pom.xml
        newPomFileVirtualFileReference = await createPomCopy(
            tmpDependencyListDir,
            pomFileVirtualFileReference,
            'pom.xml'
        )
        await replacePomVersion(
            newPomFileVirtualFileReference,
            manifestFileValues.sourcePomVersion,
            pomReplacementDelimiter
        )

        const codeSnippet = await getCodeIssueSnippetFromPom(newPomFileVirtualFileReference)
        // Let the user know we've entered the loop in the chat
        transformByQState.getChatControllers()?.startHumanInTheLoopIntervention.fire({
            tabID: ChatSessionManager.Instance.getSession().tabID,
            codeSnippet,
        })

        // 4) We need to run maven commands on that pom.xml to get available versions
        const compileFolderInfo: FolderInfo = {
            name: tmpDependencyListFolderName,
            path: tmpDependencyListDir,
        }
        runMavenDependencyUpdateCommands(compileFolderInfo)
        const { latestVersion, majorVersions, minorVersions, status } = await parseVersionsListFromPomFile(
            path.join(tmpDependencyListDir, localPathToXmlDependencyList)
        )

        if (status === dependencyNoAvailableVersions) {
            // let user know and early exit for human in the loop happened because no upgrade versions available
            const error = new AlternateDependencyVersionsNotFoundError()

            transformByQState.getChatControllers()?.errorThrown.fire({
                error,
                tabID: ChatSessionManager.Instance.getSession().tabID,
            })

            throw error
        }

        const dependencies = new DependencyVersions(
            latestVersion,
            majorVersions,
            minorVersions,
            manifestFileValues.sourcePomVersion
        )

        // 5) We need to wait for user input
        // This is asynchronous, so we have to wait to be called to complete this loop
        transformByQState.getChatControllers()?.promptForDependencyHIL.fire({
            tabID: ChatSessionManager.Instance.getSession().tabID,
            dependencies,
        })
    } catch (err: any) {
        try {
            // Regardless of the error,
            // Continue transformation flow
            await shortCircuitHiL(jobId)
        } finally {
            // TODO: report telemetry
            transformByQState.getChatControllers()?.errorThrown.fire({
                error: err,
                tabID: ChatSessionManager.Instance.getSession().tabID,
            })
        }
        codeTransformTelemetryState.setCodeTransformMetaDataField({
            errorMessage: err.message,
        })
        telemetry.codeTransform_humanInTheLoop.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformMetadata: codeTransformTelemetryState.getCodeTransformMetaDataString(),
            result: MetadataResult.Fail,
            reason: codeTransformTelemetryState.getCodeTransformMetaData().errorMessage,
        })
        return true
    } finally {
        await sleep(1000)
    }
    return false
}

export async function openHilPomFile() {
    await highlightPomIssueInProject(
        newPomFileVirtualFileReference,
        diagnosticCollection,
        manifestFileValues.sourcePomVersion
    )
}

export async function shortCircuitHiL(jobID: string) {
    // Call resume with "REJECTED" state which will put our service
    // back into the normal flow and will not trigger HIL again for this step
    await resumeTransformationJob(jobID, 'REJECTED')
}

export async function finishHumanInTheLoop(selectedDependency: string) {
    let successfulFeedbackLoop = true
    const jobId = transformByQState.getJobId()
    let hilResult: MetadataResult = MetadataResult.Pass
    try {
        const getUserInputValue = selectedDependency
        codeTransformTelemetryState.setCodeTransformMetaDataField({
            dependencyVersionSelected: selectedDependency,
        })
        // 6) We need to add user input to that pom.xml,
        // original pom.xml is intact somewhere, and run maven compile
        const userInputPomFileVirtualFileReference = await createPomCopy(
            userDependencyUpdateDir,
            PomFileVirtualFileReference,
            'pom.xml'
        )
        await replacePomVersion(userInputPomFileVirtualFileReference, getUserInputValue, pomReplacementDelimiter)

        // 7) We need to take that output of maven and use CreateUploadUrl
        const uploadFolderInfo: FolderInfo = {
            name: userDependencyUpdateFolderName,
            path: userDependencyUpdateDir,
        }
        // TODO maybe separate function for just install
        // IF WE fail, do we allow user to retry? or just fail
        // Maybe have clientside retries?
        await prepareProjectDependencies(uploadFolderInfo, uploadFolderInfo.path)
        // zipCode side effects deletes the uploadFolderInfo right away
        const uploadPayloadFilePath = await zipCode({
            dependenciesFolder: uploadFolderInfo,
            zipManifest: createZipManifest({
                dependenciesFolder: uploadFolderInfo,
                hilZipParams: {
                    pomGroupId: manifestFileValues.pomGroupId,
                    pomArtifactId: manifestFileValues.pomArtifactId,
                    targetPomVersion: getUserInputValue,
                },
            }),
        })
        // TODO map `CLIENT_INSTRUCTIONS` to `ClientInstructions` through UploadArtifactType
        await uploadPayload(uploadPayloadFilePath, {
            transformationUploadContext: {
                jobId,
                uploadArtifactType: 'Dependencies',
            },
        })

        // inform user in chat
        transformByQState.getChatControllers()?.HILSelectionUploaded.fire({
            tabID: ChatSessionManager.Instance.getSession().tabID,
        })

        // 8) Once code has been uploaded we will restart the job
        // TODO response returns "RESUMED"
        await resumeTransformationJob(jobId, 'COMPLETED')

        await sleep(1500)

        void humanInTheLoopRetryLogic(jobId)
    } catch (err: any) {
        // If anything went wrong in HIL state, we should restart the job
        // with the rejected state
        await resumeTransformationJob(jobId, 'REJECTED')
        successfulFeedbackLoop = false
        codeTransformTelemetryState.setCodeTransformMetaDataField({
            errorMessage: err.message,
        })
        hilResult = MetadataResult.Fail
    } finally {
        // Always delete the dependency directories
        await fsCommon.delete(userDependencyUpdateDir)
        await fsCommon.delete(tmpDependencyListDir)
        await fsCommon.delete(tmpDownloadsDir)
        telemetry.codeTransform_humanInTheLoop.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformMetadata: codeTransformTelemetryState.getCodeTransformMetaDataString(),
            result: hilResult,
            reason: codeTransformTelemetryState.getCodeTransformMetaData().errorMessage,
        })
    }

    return successfulFeedbackLoop
}

export async function startTransformationJob(uploadId: string) {
    let jobId = ''
    try {
        jobId = await startJob(uploadId)
    } catch (error) {
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToStartJobNotification}`, error)
        if ((error as Error).message.includes('too many active running jobs')) {
            transformByQState.setJobFailureErrorNotification(
                CodeWhispererConstants.failedToStartJobTooManyJobsNotification
            )
            transformByQState.setJobFailureErrorChatMessage(
                CodeWhispererConstants.failedToStartJobTooManyJobsChatMessage
            )
        } else {
            transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToStartJobNotification)
            transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToStartJobChatMessage)
        }
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
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`, error)
        transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToCompleteJobNotification)
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToCompleteJobChatMessage)
        throw new Error('Poll job failed')
    }
    let plan = undefined
    try {
        plan = await getTransformationPlan(jobId)
    } catch (error) {
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`, error)
        transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToGetPlanNotification)
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToGetPlanChatMessage)
        throw new Error('Get plan failed')
    }

    const planFilePath = path.join(os.tmpdir(), 'transformation-plan.md')
    fs.writeFileSync(planFilePath, plan)
    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(planFilePath))
    transformByQState.setPlanFilePath(planFilePath)
    await vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', true)
    sessionPlanProgress['generatePlan'] = StepProgress.Succeeded
    throwIfCancelled()
}

export async function pollTransformationStatusUntilComplete(jobId: string) {
    let status = ''
    try {
        status = await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForCheckingDownloadUrl)
    } catch (error) {
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`, error)
        transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToCompleteJobNotification)
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToCompleteJobChatMessage)
        throw new Error('Poll job failed')
    }

    return status
}

export async function finalizeTransformationJob(status: string) {
    if (!(status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED')) {
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`)
        sessionPlanProgress['transformCode'] = StepProgress.Failed
        transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToCompleteJobNotification)
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToCompleteJobChatMessage)
        throw new Error('Job was not successful nor partially successful')
    }

    transformByQState.setToSucceeded()
    if (status === 'PARTIALLY_COMPLETED') {
        transformByQState.setToPartiallySucceeded()
        codeTransformTelemetryState.setResultStatus('JobPartiallySucceeded')
    } else {
        codeTransformTelemetryState.setResultStatus('JobCompletedSuccessfully')
    }

    await vscode.commands.executeCommand('aws.amazonq.transformationHub.reviewChanges.reveal')
    await vscode.commands.executeCommand('aws.amazonq.refresh')

    sessionPlanProgress['transformCode'] = StepProgress.Succeeded
}

export async function getValidCandidateProjects(): Promise<TransformationCandidateProject[]> {
    const openProjects = await getOpenProjects()
    return validateOpenProjects(openProjects)
}

export async function setTransformationToRunningState() {
    await setContextVariables()
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.reviewChanges.reset')
    transformByQState.setToRunning()
    sessionPlanProgress['startJob'] = StepProgress.Pending
    sessionPlanProgress['buildCode'] = StepProgress.Pending
    sessionPlanProgress['generatePlan'] = StepProgress.Pending
    sessionPlanProgress['transformCode'] = StepProgress.Pending
    transformByQState.resetPlanSteps()

    codeTransformTelemetryState.setStartTime()

    const projectPath = transformByQState.getProjectPath()
    let projectId = telemetryUndefined
    if (projectPath !== undefined) {
        projectId = getStringHash(projectPath)
    }

    telemetry.codeTransform_jobStartedCompleteFromPopupDialog.emit({
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        codeTransformJavaSourceVersionsAllowed: JDKToTelemetryValue(
            transformByQState.getSourceJDKVersion()!
        ) as CodeTransformJavaSourceVersionsAllowed,
        codeTransformJavaTargetVersionsAllowed: JDKToTelemetryValue(
            transformByQState.getTargetJDKVersion()
        ) as CodeTransformJavaTargetVersionsAllowed,
        codeTransformProjectId: projectId,
        result: MetadataResult.Pass,
    })

    await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
    await vscode.commands.executeCommand(
        'aws.amazonq.showPlanProgressInHub',
        codeTransformTelemetryState.getStartTime()
    )

    await vscode.commands.executeCommand('aws.amazonq.refresh')
}

export async function postTransformationJob() {
    if (sessionPlanProgress['startJob'] !== StepProgress.Succeeded) {
        sessionPlanProgress['startJob'] = StepProgress.Failed
    }
    if (sessionPlanProgress['buildCode'] !== StepProgress.Succeeded) {
        sessionPlanProgress['buildCode'] = StepProgress.Failed
    }
    if (sessionPlanProgress['generatePlan'] !== StepProgress.Succeeded) {
        sessionPlanProgress['generatePlan'] = StepProgress.Failed
    }
    if (sessionPlanProgress['transformCode'] !== StepProgress.Succeeded) {
        sessionPlanProgress['transformCode'] = StepProgress.Failed
    }

    let chatMessage = transformByQState.getJobFailureErrorChatMessage()
    if (transformByQState.isSucceeded()) {
        chatMessage = CodeWhispererConstants.jobCompletedChatMessage
    } else if (transformByQState.isPartiallySucceeded()) {
        chatMessage = CodeWhispererConstants.jobPartiallyCompletedChatMessage
    }

    transformByQState
        .getChatControllers()
        ?.transformationFinished.fire({ message: chatMessage, tabID: ChatSessionManager.Instance.getSession().tabID })
    const durationInMs = calculateTotalLatency(codeTransformTelemetryState.getStartTime())
    const resultStatusMessage = codeTransformTelemetryState.getResultStatus()

    const versionInfo = await getVersionData()
    const mavenVersionInfoMessage = `${versionInfo[0]} (${transformByQState.getMavenName()})`
    const javaVersionInfoMessage = `${versionInfo[1]} (${transformByQState.getMavenName()})`

    // Note: IntelliJ implementation of ResultStatusMessage includes additional metadata such as jobId.
    telemetry.codeTransform_totalRunTime.emit({
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        codeTransformResultStatusMessage: resultStatusMessage,
        codeTransformRunTimeLatency: durationInMs,
        codeTransformLocalMavenVersion: mavenVersionInfoMessage,
        codeTransformLocalJavaVersion: javaVersionInfoMessage,
        result: resultStatusMessage === 'JobCompletedSuccessfully' ? MetadataResult.Pass : MetadataResult.Fail,
        reason: resultStatusMessage,
    })

    sessionJobHistory = processHistory(
        sessionJobHistory,
        convertDateToTimestamp(new Date(codeTransformTelemetryState.getStartTime())),
        transformByQState.getProjectName(),
        transformByQState.getStatus(),
        convertToTimeString(durationInMs),
        transformByQState.getJobId()
    )

    if (transformByQState.isSucceeded()) {
        void vscode.window.showInformationMessage(CodeWhispererConstants.jobCompletedNotification)
    } else if (transformByQState.isPartiallySucceeded()) {
        void vscode.window
            .showInformationMessage(
                CodeWhispererConstants.jobPartiallyCompletedNotification,
                CodeWhispererConstants.amazonQFeedbackText
            )
            .then(choice => {
                if (choice === CodeWhispererConstants.amazonQFeedbackText) {
                    void submitFeedback.execute(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                }
            })
    }

    if (transformByQState.getPayloadFilePath() !== '') {
        fs.rmSync(transformByQState.getPayloadFilePath(), { recursive: true, force: true }) // delete ZIP if it exists
    }
}

export async function transformationJobErrorHandler(error: any) {
    if (!transformByQState.isCancelled()) {
        // means some other error occurred; cancellation already handled by now with stopTransformByQ
        transformByQState.setToFailed()
        codeTransformTelemetryState.setResultStatus('JobFailed')
        // jobFailureErrorNotification should always be defined here
        let displayedErrorMessage = transformByQState.getJobFailureErrorNotification() ?? 'Job failed'
        if (transformByQState.getJobFailureMetadata() !== '') {
            displayedErrorMessage += ` ${transformByQState.getJobFailureMetadata()}`
            transformByQState.setJobFailureErrorChatMessage(
                `${transformByQState.getJobFailureErrorChatMessage()} ${transformByQState.getJobFailureMetadata()}`
            )
        }
        void vscode.window
            .showErrorMessage(displayedErrorMessage, CodeWhispererConstants.amazonQFeedbackText)
            .then(choice => {
                if (choice === CodeWhispererConstants.amazonQFeedbackText) {
                    void submitFeedback.execute(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                }
            })
    } else {
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.jobCancelledChatMessage)
    }
    getLogger().error(`CodeTransformation: ${error.message}`)
}

export async function cleanupTransformationJob() {
    clearInterval(pollUIIntervalId)
    transformByQState.setJobDefaults()
    await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
    await vscode.commands.executeCommand('aws.amazonq.refresh')
    await vscode.commands.executeCommand(
        'aws.amazonq.showPlanProgressInHub',
        codeTransformTelemetryState.getStartTime()
    )
    codeTransformTelemetryState.resetCodeTransformMetaDataField()
}

export function processHistory(
    sessionJobHistory: { timestamp: string; module: string; status: string; duration: string; id: string }[],
    startTime: string,
    module: string,
    status: string,
    duration: string,
    id: string
) {
    sessionJobHistory = [] // reset job history; only storing the last run for now
    const copyState = { timestamp: startTime, module: module, status: status, duration: duration, id: id }
    sessionJobHistory.push(copyState)
    return sessionJobHistory
}

export function getJobHistory() {
    return sessionJobHistory
}

export function getPlanProgress() {
    return sessionPlanProgress
}

export async function stopTransformByQ(
    jobId: string,
    cancelSrc: CancelActionPositions = CancelActionPositions.BottomHubPanel
) {
    if (transformByQState.isRunning()) {
        getLogger().info('CodeTransformation: User requested to stop transformation. Stopping transformation.')
        transformByQState.setToCancelled()
        codeTransformTelemetryState.setResultStatus('JobCancelled')
        await vscode.commands.executeCommand('aws.amazonq.refresh')
        await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
        try {
            await stopJob(jobId)
            void vscode.window
                .showErrorMessage(
                    CodeWhispererConstants.jobCancelledNotification,
                    CodeWhispererConstants.amazonQFeedbackText
                )
                .then(choice => {
                    if (choice === CodeWhispererConstants.amazonQFeedbackText) {
                        void submitFeedback.execute(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                    }
                })
        } catch {
            void vscode.window
                .showErrorMessage(
                    CodeWhispererConstants.errorStoppingJobNotification,
                    CodeWhispererConstants.amazonQFeedbackText
                )
                .then(choice => {
                    if (choice === CodeWhispererConstants.amazonQFeedbackText) {
                        void submitFeedback.execute(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                    }
                })
        }
        telemetry.codeTransform_jobIsCancelledByUser.emit({
            codeTransformCancelSrcComponents: cancelSrc as CodeTransformCancelSrcComponents,
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
    }
}

async function setContextVariables() {
    await vscode.commands.executeCommand('setContext', 'gumby.wasQCodeTransformationUsed', true)
    await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', true)
    await vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', false)
    await vscode.commands.executeCommand('setContext', 'gumby.isSummaryAvailable', false)
    await vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.NotStarted)
    await vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
}
