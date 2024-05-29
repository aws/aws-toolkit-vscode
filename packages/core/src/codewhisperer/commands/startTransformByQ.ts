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
    JDKVersion,
    jobPlanProgress,
    FolderInfo,
    TransformationCandidateProject,
    ZipManifest,
    TransformByQStatus,
} from '../models/model'
import { convertDateToTimestamp, getStringHash } from '../../shared/utilities/textUtilities'
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
    updateJobHistory,
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
import { CodeTransformTelemetryState } from '../../amazonqGumby/telemetry/codeTransformTelemetryState'
import {
    CancelActionPositions,
    JDKToTelemetryValue,
    calculateTotalLatency,
    telemetryUndefined,
} from '../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'
import { submitFeedback } from '../../feedback/vue/submitFeedback'
import { placeholder } from '../../shared/vscode/commands2'
import {
    AlternateDependencyVersionsNotFoundError,
    JavaHomeNotSetError,
    JobStartError,
    ModuleUploadError,
    PollJobError,
} from '../../amazonqGumby/errors'
import { ChatSessionManager } from '../../amazonqGumby/chat/storages/chatSession'
import {
    getCodeIssueSnippetFromPom,
    getDependenciesFolderInfo,
    getJsonValuesFromManifestFile,
    highlightPomIssueInProject,
    parseVersionsListFromPomFile,
    writeLogs,
} from '../service/transformByQ/transformFileHandler'
import { sleep } from '../../shared/utilities/timeoutUtils'
import DependencyVersions from '../../amazonqGumby/models/dependencies'
import { dependencyNoAvailableVersions } from '../../amazonqGumby/models/constants'
import { HumanInTheLoopManager } from '../service/transformByQ/humanInTheLoopManager'

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
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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

export function startInterval() {
    const intervalId = setInterval(() => {
        void vscode.commands.executeCommand(
            'aws.amazonq.showPlanProgressInHub',
            CodeTransformTelemetryState.instance.getStartTime()
        )
        updateJobHistory()
    }, CodeWhispererConstants.transformationJobPollingIntervalSeconds * 1000)
    transformByQState.setIntervalId(intervalId)
}

export async function startTransformByQ() {
    // Set the default state variables for our store and the UI
    await setTransformationToRunningState()

    try {
        // Set webview UI to poll for progress
        startInterval()

        // step 1: CreateUploadUrl and upload code
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

        transformByQState.getChatControllers()?.errorThrown.fire({
            error: new ModuleUploadError(),
            tabID: ChatSessionManager.Instance.getSession().tabID,
        })
        getLogger().error(errorMessage)
        throw err
    }

    await sleep(2000) // sleep before starting job to prevent ThrottlingException
    throwIfCancelled()

    return uploadId
}

export async function initiateHumanInTheLoopPrompt(jobId: string) {
    try {
        const humanInTheLoopManager = HumanInTheLoopManager.instance
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
            humanInTheLoopManager.getTmpDownloadsDir()
        )
        humanInTheLoopManager.setPomFileVirtualFileReference(pomFileVirtualFileReference)
        const manifestFileValues = await getJsonValuesFromManifestFile(manifestFileVirtualFileReference)
        humanInTheLoopManager.setManifestFileValues(manifestFileValues)

        // 3) We need to replace version in pom.xml
        const newPomFileVirtualFileReference = await humanInTheLoopManager.createPomFileCopy(
            humanInTheLoopManager.getTmpDependencyListDir(),
            pomFileVirtualFileReference
        )
        humanInTheLoopManager.setNewPomFileVirtualFileReference(newPomFileVirtualFileReference)
        await humanInTheLoopManager.replacePomFileVersion(
            newPomFileVirtualFileReference,
            manifestFileValues.sourcePomVersion
        )

        const codeSnippet = await getCodeIssueSnippetFromPom(newPomFileVirtualFileReference)
        // Let the user know we've entered the loop in the chat
        transformByQState.getChatControllers()?.humanInTheLoopStartIntervention.fire({
            tabID: ChatSessionManager.Instance.getSession().tabID,
            codeSnippet,
        })

        // 4) We need to run maven commands on that pom.xml to get available versions
        const compileFolderInfo = humanInTheLoopManager.getCompileDependencyListFolderInfo()
        runMavenDependencyUpdateCommands(compileFolderInfo)
        const xmlString = await humanInTheLoopManager.getDependencyListXmlOutput()
        const { latestVersion, majorVersions, minorVersions, status } = await parseVersionsListFromPomFile(xmlString)

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
        transformByQState.getChatControllers()?.humanInTheLoopPromptUserForDependency.fire({
            tabID: ChatSessionManager.Instance.getSession().tabID,
            dependencies,
        })
    } catch (err: any) {
        try {
            // Regardless of the error,
            // Continue transformation flow
            await terminateHILEarly(jobId)
        } finally {
            transformByQState.getChatControllers()?.errorThrown.fire({
                error: err,
                tabID: ChatSessionManager.Instance.getSession().tabID,
            })
        }
        CodeTransformTelemetryState.instance.setCodeTransformMetaDataField({
            errorMessage: err.message,
        })
        await HumanInTheLoopManager.instance.cleanUpArtifacts()
        return true
    } finally {
        await sleep(1000)
        telemetry.codeTransform_humanInTheLoop.emit({
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformMetadata: CodeTransformTelemetryState.instance.getCodeTransformMetaDataString(),
            result: MetadataResult.Fail,
            // TODO: make a generic reason field for telemetry logging so we don't log sensitive PII data
            reason: 'Runtime error occurred',
        })
    }
    return false
}

export async function openHilPomFile() {
    const humanInTheLoopManager = HumanInTheLoopManager.instance
    await highlightPomIssueInProject(
        humanInTheLoopManager.getNewPomFileVirtualFileReference(),
        HumanInTheLoopManager.instance.diagnosticCollection,
        humanInTheLoopManager.getManifestFileValues().sourcePomVersion
    )
}

export async function terminateHILEarly(jobID: string) {
    // Call resume with "REJECTED" state which will put our service
    // back into the normal flow and will not trigger HIL again for this step
    await resumeTransformationJob(jobID, 'REJECTED')
}

export async function finishHumanInTheLoop(selectedDependency?: string) {
    let successfulFeedbackLoop = true
    const jobId = transformByQState.getJobId()
    let hilResult: MetadataResult = MetadataResult.Pass
    try {
        if (!selectedDependency) {
            throw new Error('No user action')
        }
        const humanInTheLoopManager = HumanInTheLoopManager.instance
        const manifestFileValues = humanInTheLoopManager.getManifestFileValues()
        const getUserInputValue = selectedDependency

        CodeTransformTelemetryState.instance.setCodeTransformMetaDataField({
            dependencyVersionSelected: selectedDependency,
        })
        // 6) We need to add user input to that pom.xml,
        // original pom.xml is intact somewhere, and run maven compile
        const userInputPomFileVirtualFileReference = await humanInTheLoopManager.createPomFileCopy(
            humanInTheLoopManager.getUserDependencyUpdateDir(),
            humanInTheLoopManager.getPomFileVirtualFileReference()
        )
        await humanInTheLoopManager.replacePomFileVersion(userInputPomFileVirtualFileReference, getUserInputValue)

        // 7) We need to take that output of maven and use CreateUploadUrl
        const uploadFolderInfo = humanInTheLoopManager.getUploadFolderInfo()
        await prepareProjectDependencies(uploadFolderInfo, uploadFolderInfo.path)
        // zipCode side effects deletes the uploadFolderInfo right away
        const uploadPayloadFilePath = await zipCode({
            dependenciesFolder: uploadFolderInfo,
            zipManifest: createZipManifest({
                hilZipParams: {
                    pomGroupId: manifestFileValues.pomGroupId,
                    pomArtifactId: manifestFileValues.pomArtifactId,
                    targetPomVersion: getUserInputValue,
                },
            }),
        })

        await uploadPayload(uploadPayloadFilePath, {
            transformationUploadContext: {
                jobId,
                uploadArtifactType: 'Dependencies',
            },
        })

        // inform user in chat
        transformByQState.getChatControllers()?.humanInTheLoopSelectionUploaded.fire({
            tabID: ChatSessionManager.Instance.getSession().tabID,
        })

        // 8) Once code has been uploaded we will restart the job
        await resumeTransformationJob(jobId, 'COMPLETED')

        void humanInTheLoopRetryLogic(jobId)
    } catch (err: any) {
        successfulFeedbackLoop = false
        CodeTransformTelemetryState.instance.setCodeTransformMetaDataField({
            errorMessage: err.message,
        })
        hilResult = MetadataResult.Fail

        // If anything went wrong in HIL state, we should restart the job
        // with the rejected state
        await terminateHILEarly(jobId)
        void humanInTheLoopRetryLogic(jobId)
    } finally {
        // Always delete the dependency directories
        telemetry.codeTransform_humanInTheLoop.emit({
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformJobId: jobId,
            codeTransformMetadata: CodeTransformTelemetryState.instance.getCodeTransformMetaDataString(),
            result: hilResult,
            // TODO: make a generic reason field for telemetry logging so we don't log sensitive PII data
            reason: hilResult === MetadataResult.Fail ? 'Runtime error occurred' : undefined,
        })
        await HumanInTheLoopManager.instance.cleanUpArtifacts()
    }

    return successfulFeedbackLoop
}

export async function startTransformationJob(uploadId: string) {
    let jobId = ''
    try {
        jobId = await startJob(uploadId)
        getLogger().info(`CodeTransformation: jobId: ${jobId}`)
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
        throw new JobStartError()
    }

    await sleep(2000) // sleep before polling job to prevent ThrottlingException
    throwIfCancelled()

    return jobId
}

export async function pollTransformationStatusUntilPlanReady(jobId: string) {
    try {
        await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForPlanGenerated)
    } catch (error) {
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`, error)
        if (!transformByQState.getJobFailureErrorNotification()) {
            transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToCompleteJobNotification)
        }
        if (!transformByQState.getJobFailureErrorChatMessage()) {
            transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToCompleteJobChatMessage)
        }
        throw new PollJobError()
    }
    let plan = undefined
    try {
        plan = await getTransformationPlan(jobId)
    } catch (error) {
        // means API call failed
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`, error)
        transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToGetPlanNotification)
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToGetPlanChatMessage)
        throw new Error('Get plan failed')
    }

    if (plan !== undefined) {
        const planFilePath = path.join(transformByQState.getProjectPath(), 'transformation-plan.md')
        fs.writeFileSync(planFilePath, plan)
        await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(planFilePath))
        transformByQState.setPlanFilePath(planFilePath)
        await vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', true)
    }
    jobPlanProgress['generatePlan'] = StepProgress.Succeeded
    throwIfCancelled()
}

export async function pollTransformationStatusUntilComplete(jobId: string) {
    let status = ''
    try {
        status = await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForCheckingDownloadUrl)
    } catch (error) {
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`, error)
        if (!transformByQState.getJobFailureErrorNotification()) {
            transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToCompleteJobNotification)
        }
        if (!transformByQState.getJobFailureErrorChatMessage()) {
            transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToCompleteJobChatMessage)
        }
        throw new PollJobError()
    }

    return status
}

export async function finalizeTransformationJob(status: string) {
    if (!(status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED')) {
        getLogger().error(`CodeTransformation: ${CodeWhispererConstants.failedToCompleteJobNotification}`)
        jobPlanProgress['transformCode'] = StepProgress.Failed
        transformByQState.setJobFailureErrorNotification(CodeWhispererConstants.failedToCompleteJobNotification)
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.failedToCompleteJobChatMessage)
        throw new Error('Job was not successful nor partially successful')
    }
    transformByQState.setToSucceeded()
    if (status === 'PARTIALLY_COMPLETED') {
        transformByQState.setToPartiallySucceeded()
    }
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.reviewChanges.reveal')
    jobPlanProgress['transformCode'] = StepProgress.Succeeded
}

export async function getValidCandidateProjects(): Promise<TransformationCandidateProject[]> {
    const openProjects = await getOpenProjects()
    return validateOpenProjects(openProjects)
}

export async function setTransformationToRunningState() {
    await setContextVariables()
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.reviewChanges.reset')
    transformByQState.setToRunning()
    jobPlanProgress['startJob'] = StepProgress.Pending
    jobPlanProgress['buildCode'] = StepProgress.Pending
    jobPlanProgress['generatePlan'] = StepProgress.Pending
    jobPlanProgress['transformCode'] = StepProgress.Pending
    transformByQState.resetPlanSteps()
    transformByQState.resetSessionJobHistory()
    transformByQState.setJobId('') // so that details for last job are not overwritten when running one job after another
    transformByQState.setPolledJobStatus('') // so that previous job's status does not display at very beginning of this job

    CodeTransformTelemetryState.instance.setStartTime()
    transformByQState.setStartTime(
        convertDateToTimestamp(new Date(CodeTransformTelemetryState.instance.getStartTime()))
    )

    const projectPath = transformByQState.getProjectPath()
    let projectId = telemetryUndefined
    if (projectPath !== undefined) {
        projectId = getStringHash(projectPath)
    }

    telemetry.codeTransform_jobStartedCompleteFromPopupDialog.emit({
        codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
}

export async function postTransformationJob() {
    updateJobHistory()
    if (jobPlanProgress['startJob'] !== StepProgress.Succeeded) {
        jobPlanProgress['startJob'] = StepProgress.Failed
    }
    if (jobPlanProgress['buildCode'] !== StepProgress.Succeeded) {
        jobPlanProgress['buildCode'] = StepProgress.Failed
    }
    if (jobPlanProgress['generatePlan'] !== StepProgress.Succeeded) {
        jobPlanProgress['generatePlan'] = StepProgress.Failed
    }
    if (jobPlanProgress['transformCode'] !== StepProgress.Succeeded) {
        jobPlanProgress['transformCode'] = StepProgress.Failed
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
    const durationInMs = calculateTotalLatency(CodeTransformTelemetryState.instance.getStartTime())
    const resultStatusMessage = transformByQState.getStatus()

    const versionInfo = await getVersionData()
    const mavenVersionInfoMessage = `${versionInfo[0]} (${transformByQState.getMavenName()})`
    const javaVersionInfoMessage = `${versionInfo[1]} (${transformByQState.getMavenName()})`

    // Note: IntelliJ implementation of ResultStatusMessage includes additional metadata such as jobId.
    telemetry.codeTransform_totalRunTime.emit({
        codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
        codeTransformResultStatusMessage: resultStatusMessage,
        codeTransformRunTimeLatency: durationInMs,
        codeTransformLocalMavenVersion: mavenVersionInfoMessage,
        codeTransformLocalJavaVersion: javaVersionInfoMessage,
        result: resultStatusMessage === TransformByQStatus.Succeeded ? MetadataResult.Pass : MetadataResult.Fail,
        reason: resultStatusMessage,
    })

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
                    void submitFeedback(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
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
        transformByQState.setPolledJobStatus('FAILED')
        // jobFailureErrorNotification should always be defined here
        let displayedErrorMessage =
            transformByQState.getJobFailureErrorNotification() ?? CodeWhispererConstants.failedToCompleteJobNotification
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
                    void submitFeedback(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                }
            })
    } else {
        transformByQState.setToCancelled()
        transformByQState.setPolledJobStatus('CANCELLED')
    }
    getLogger().error(`CodeTransformation: ${error.message}`)

    transformByQState.getChatControllers()?.errorThrown.fire({
        error,
        tabID: ChatSessionManager.Instance.getSession().tabID,
    })
}

export async function cleanupTransformationJob() {
    clearInterval(transformByQState.getIntervalId())
    transformByQState.setJobDefaults()
    await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
    await vscode.commands.executeCommand(
        'aws.amazonq.showPlanProgressInHub',
        CodeTransformTelemetryState.instance.getStartTime()
    )
    CodeTransformTelemetryState.instance.resetCodeTransformMetaDataField()
}

export async function stopTransformByQ(
    jobId: string,
    cancelSrc: CancelActionPositions = CancelActionPositions.BottomHubPanel
) {
    if (transformByQState.isRunning()) {
        getLogger().info('CodeTransformation: User requested to stop transformation. Stopping transformation.')
        transformByQState.setToCancelled()
        transformByQState.setPolledJobStatus('CANCELLED')
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
                        void submitFeedback(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
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
                        void submitFeedback(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                    }
                })
        } finally {
            telemetry.codeTransform_jobIsCancelledByUser.emit({
                codeTransformCancelSrcComponents: cancelSrc as CodeTransformCancelSrcComponents,
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                result: MetadataResult.Pass,
            })
        }
    }
}

async function setContextVariables() {
    await vscode.commands.executeCommand('setContext', 'gumby.wasQCodeTransformationUsed', true)
    await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', true)
    await vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', false)
    await vscode.commands.executeCommand('setContext', 'gumby.isSummaryAvailable', false)
}
