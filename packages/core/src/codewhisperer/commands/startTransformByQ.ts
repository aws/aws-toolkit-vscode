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
} from '../models/model'
import { convertToTimeString, convertDateToTimestamp, encodeHTML } from '../../shared/utilities/textUtilities'
import {
    getTransformationPlan,
    pollTransformationJob,
    startJob,
    stopJob,
    throwIfCancelled,
    uploadPayload,
    zipCode,
} from '../service/transformByQ/transformApiHandler'
import { getOpenProjects, validateOpenProjects } from '../service/transformByQ/transformProjectValidationHandler'
import { getVersionData, prepareProjectDependencies } from '../service/transformByQ/transformMavenHandler'
import { getStringHash } from '../../shared/utilities/textUtilities'
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
import { JavaHomeNotSetError } from '../../amazonqGumby/errors'
import { ChatSessionManager } from '../../amazonqGumby/chat/storages/chatSession'
import { getDependenciesFolderInfo, writeLogs } from '../service/transformByQ/transformFileHandler'
import { sleep } from '../../shared/utilities/timeoutUtils'

let sessionJobHistory: { timestamp: string; module: string; status: string; duration: string; id: string }[] = []

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
        await prepareProjectDependencies(dependenciesFolder)
    } catch (err) {
        // open build-logs.txt file to show user error logs
        const logFilePath = await writeLogs()
        const doc = await vscode.workspace.openTextDocument(logFilePath)
        await vscode.window.showTextDocument(doc)
        throw err
    }
}

export async function startTransformByQ() {
    let intervalId = undefined
    // Set the default state variables for our store and the UI
    await setTransformationToRunningState()

    try {
        // Set web view UI to poll for progress
        intervalId = setInterval(() => {
            void vscode.commands.executeCommand(
                'aws.amazonq.showPlanProgressInHub',
                CodeTransformTelemetryState.instance.getStartTime()
            )
        }, CodeWhispererConstants.transformationJobPollingIntervalSeconds * 1000)

        // step 1: CreateCodeUploadUrl and upload code
        const uploadId = await preTransformationUploadCode()

        // step 2: StartJob and store the returned jobId in TransformByQState
        const jobId = await startTransformationJob(uploadId)

        // step 3 (intermediate step): show transformation-plan.md file
        await pollTransformationStatusUntilPlanReady(jobId)

        // step 4: poll until artifacts are ready to download
        const status = await pollTransformationStatusUntilComplete(jobId)

        // Set the result state variables for our store and the UI
        await finalizeTransformationJob(status)
    } catch (error: any) {
        await transformationJobErrorHandler(error)
    } finally {
        await postTransformationJob()
        await cleanupTransformationJob(intervalId)
    }
}

export async function preTransformationUploadCode() {
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.focus')

    void vscode.window.showInformationMessage(CodeWhispererConstants.jobStartedNotification)

    let uploadId = ''
    let payloadFilePath = ''
    throwIfCancelled()
    try {
        payloadFilePath = await zipCode(transformByQState.getDependencyFolderInfo()!)
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
        CodeTransformTelemetryState.instance.setResultStatus('JobPartiallySucceeded')
    } else {
        CodeTransformTelemetryState.instance.setResultStatus('JobCompletedSuccessfully')
    }

    await vscode.commands.executeCommand('aws.amazonq.transformationHub.reviewChanges.reveal')

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

    CodeTransformTelemetryState.instance.setStartTime()

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
    await vscode.commands.executeCommand(
        'aws.amazonq.showPlanProgressInHub',
        CodeTransformTelemetryState.instance.getStartTime()
    )
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
    const durationInMs = calculateTotalLatency(CodeTransformTelemetryState.instance.getStartTime())
    const resultStatusMessage = CodeTransformTelemetryState.instance.getResultStatus()

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
        result: resultStatusMessage === 'JobCompletedSuccessfully' ? MetadataResult.Pass : MetadataResult.Fail,
        reason: resultStatusMessage,
    })

    sessionJobHistory = processHistory(
        sessionJobHistory,
        convertDateToTimestamp(new Date(CodeTransformTelemetryState.instance.getStartTime())),
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
        CodeTransformTelemetryState.instance.setResultStatus('JobFailed')
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
                    void submitFeedback(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                }
            })
    } else {
        transformByQState.setJobFailureErrorChatMessage(CodeWhispererConstants.jobCancelledChatMessage)
    }
    getLogger().error(`CodeTransformation: ${error.message}`)
}

export async function cleanupTransformationJob(intervalId: NodeJS.Timeout | undefined) {
    clearInterval(intervalId)
    transformByQState.setJobDefaults()
    await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
    await vscode.commands.executeCommand(
        'aws.amazonq.showPlanProgressInHub',
        CodeTransformTelemetryState.instance.getStartTime()
    )
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
        CodeTransformTelemetryState.instance.setResultStatus('JobCancelled')
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
        }
        telemetry.codeTransform_jobIsCancelledByUser.emit({
            codeTransformCancelSrcComponents: cancelSrc as CodeTransformCancelSrcComponents,
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
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
