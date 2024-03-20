/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as fs from 'fs'
import * as os from 'os'
import { getLogger } from '../../shared/logger'
import * as CodeWhispererConstants from '../models/constants'
import {
    transformByQState,
    StepProgress,
    TransformByQReviewStatus,
    JDKVersion,
    TransformByQStatus,
} from '../models/model'
import {
    throwIfCancelled,
    startJob,
    stopJob,
    uploadPayload,
    getTransformationPlan,
    zipCode,
    pollTransformationJob,
    convertToTimeString,
    convertDateToTimestamp,
    getOpenProjects,
    getVersionData,
    validateOpenProjects,
    writeLogs,
    TransformationCandidateProject,
    getDependenciesFolderInfo,
    FolderInfo,
    prepareProjectDependencies,
    getTransformationSteps,
} from '../service/transformByQHandler'
import path from 'path'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { encodeHTML } from '../../shared/utilities/textUtilities'
import {
    CodeTransformCancelSrcComponents,
    CodeTransformJavaSourceVersionsAllowed,
    CodeTransformJavaTargetVersionsAllowed,
    telemetry,
} from '../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { ToolkitError } from '../../shared/errors'
import { TransformByQUploadArchiveFailed } from '../../amazonqGumby/models/model'
import {
    CancelActionPositions,
    JDKToTelemetryValue,
    calculateTotalLatency,
} from '../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'
import { JavaHomeNotSetError } from '../../amazonqGumby/errors'
import { getArtifactIdentifiers } from '../service/transformByQHumanInTheLoopHandler'
import { downloadResultArchive } from '../service/amazonQGumby/transformByQApiHandler'

const localize = nls.loadMessageBundle()
export const stopTransformByQButton = localize('aws.codewhisperer.stop.transform.by.q', 'Stop')

let sessionJobHistory: { timestamp: string; module: string; status: string; duration: string; id: string }[] = []

const sessionPlanProgress: {
    uploadCode: StepProgress
    buildCode: StepProgress
    transformCode: StepProgress
    returnCode: StepProgress
} = {
    uploadCode: StepProgress.NotStarted,
    buildCode: StepProgress.NotStarted,
    transformCode: StepProgress.NotStarted,
    returnCode: StepProgress.NotStarted,
}

export async function startTransformByQWithProgress() {
    await startTransformByQ()
}

export async function processTransformFormInput(
    pathToModule: string,
    fromJDKVersion: JDKVersion,
    toJDKVersion: JDKVersion
) {
    transformByQState.setProjectName(path.basename(pathToModule))
    transformByQState.setProjectPath(pathToModule)
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
        //todo[GUMBY] this needs to be renamed to have 'error' on the end
        throw new JavaHomeNotSetError()
    }
}

export async function compileProject() {
    try {
        const dependenciesFolder: FolderInfo = getDependenciesFolderInfo()
        transformByQState.setDependencyFolderInfo(dependenciesFolder)
        await prepareProjectDependencies(dependenciesFolder)
    } catch (err) {
        void vscode.window.showErrorMessage(CodeWhispererConstants.installErrorMessage)
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
                codeTransformTelemetryState.getStartTime()
            )
        }, CodeWhispererConstants.progressIntervalMs)

        // step 1: CreateCodeUploadUrl and upload code
        const uploadId = await preTransformationUploadCode()

        // step 2: StartJob and store the returned jobId in TransformByQState
        const jobId = await startTransformationJob(uploadId)

        // step 3 (intermediate step): show transformation-plan.md file
        await pollTransformationStatusUntilPlanReady(jobId)

        // step 4: poll until artifacts are ready to download
        const status = await pollTransformationStatusUntilComplete(jobId, 0)

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
    await vscode.commands.executeCommand('aws.amazonq.refresh')
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.focus')

    let uploadId = ''
    let payloadFilePath = ''
    throwIfCancelled()
    try {
        payloadFilePath = await zipCode(transformByQState.getDependencyFolderInfo()!)
        transformByQState.setPayloadFilePath(payloadFilePath)
        await vscode.commands.executeCommand('aws.amazonq.refresh') // so that button updates
        uploadId = await uploadPayload(payloadFilePath)
    } catch (error) {
        const errorMessage = `Failed to upload code due to ${(error as Error).message}`
        getLogger().error(errorMessage)
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            result: MetadataResult.Fail,
            reason: 'UploadArchiveFailed',
        })
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new TransformByQUploadArchiveFailed()
    }
    sessionPlanProgress['uploadCode'] = StepProgress.Succeeded
    await vscode.commands.executeCommand('aws.amazonq.refresh')

    await sleep(2000) // sleep before starting job to prevent ThrottlingException
    throwIfCancelled()

    return uploadId
}

export async function startTransformationJob(uploadId: string) {
    let jobId = ''
    try {
        jobId = await startJob(uploadId)
    } catch (error) {
        const errorMessage = 'Failed to start job'
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            result: MetadataResult.Fail,
            reason: 'StartJobFailed',
        })
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new ToolkitError(errorMessage, { cause: error as Error })
    }
    transformByQState.setJobId(encodeHTML(jobId))
    await vscode.commands.executeCommand('aws.amazonq.refresh')

    await sleep(2000) // sleep before polling job to prevent ThrottlingException
    throwIfCancelled()

    return jobId
}

export async function pollTransformationStatusUntilPlanReady(jobId: string) {
    try {
        await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForGettingPlan)
    } catch (error) {
        const errorMessage = 'Failed to get job status or job itself failed'
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new ToolkitError(errorMessage, { cause: error as Error })
    }
    let plan = undefined
    try {
        plan = await getTransformationPlan(jobId)
    } catch (error) {
        const errorMessage = 'Failed to get transformation plan'
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new ToolkitError(errorMessage, { cause: error as Error })
    }
    sessionPlanProgress['buildCode'] = StepProgress.Succeeded
    const planFilePath = path.join(os.tmpdir(), 'transformation-plan.md')
    fs.writeFileSync(planFilePath, plan)
    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(planFilePath))
    transformByQState.setPlanFilePath(planFilePath)
    await vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', true)
    throwIfCancelled()
}

export async function pollTransformationStatusUntilComplete(jobId: string, userInputRetryCount: number) {
    let status = ''
    try {
        status = await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForCheckingDownloadUrl)
    } catch (error) {
        const errorMessage = 'Failed to get transformation job status'
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new ToolkitError(errorMessage, { cause: error as Error })
    }

    // Use recursion here to get user input
    if (
        status === TransformByQStatus.WaitingUserInput &&
        userInputRetryCount > CodeWhispererConstants.maxHumanInTheLoopAttempts
    ) {
        try {
            userInputRetryCount++

            // 8) Once all this is successful we need to re-initiate pollTransformationStatusUntilComplete
            await completeHumanInTheLoopWork(jobId, userInputRetryCount)
            status = await pollTransformationStatusUntilComplete(jobId, userInputRetryCount)
        } catch (e) {
            // do nothing for now. If a recursive call failed, need to set status appropriately?
            // or throw error
        }
    }

    return status
}

export async function completeHumanInTheLoopWork(jobId: string, userInputRetryCount: number) {
    try {
        // 1) We need to call GetTransformationPlan to get artifactId
        const transformationSteps = await getTransformationSteps(jobId, false)
        const { artifactId, artifactType } = getArtifactIdentifiers(transformationSteps)

        // 2) We need to call DownloadResultArchive to get the manifest and pom.xml
        const { pomFileVirtualFileReference, manifestFileVirtualFileReference } = await downloadResultArchive(
            jobId,
            artifactId,
            artifactType
        )

        // 3) We need to replace version in pom.xml

        // 4) We need to run maven commands on that pom.xml to get available versions
        // 5) We need to wait for user input
        // 6) We need to add user input to that pom.xml, original pom.xml is intact somewhere, and run maven compile
        // 7) We need to take that output of maven and use CreateUploadUrl
    } catch (e) {
        // Will probably emit different TYPES of errors from the Human in the loop engagement
        // catch them here and determine what to do with in parent function
    }
}

export async function finalizeTransformationJob(status: string) {
    if (!(status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED')) {
        const errorMessage = 'Failed to complete transformation'
        getLogger().error(`CodeTransformation: ${errorMessage}`)
        sessionPlanProgress['transformCode'] = StepProgress.Failed
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new ToolkitError(errorMessage, { code: 'JobDidNotSucceed' })
    }

    sessionPlanProgress['transformCode'] = StepProgress.Succeeded
    transformByQState.setToSucceeded()
    if (status === 'PARTIALLY_COMPLETED') {
        transformByQState.setToPartiallySucceeded()
        codeTransformTelemetryState.setResultStatus('JobPartiallySucceeded')
    } else {
        codeTransformTelemetryState.setResultStatus('JobCompletedSuccessfully')
    }

    await vscode.commands.executeCommand('aws.amazonq.transformationHub.reviewChanges.reveal')
    await vscode.commands.executeCommand('aws.amazonq.refresh')

    transformByQState.getChatControllers()?.transformationFinished.fire({
        jobStatus: status,
        tabID: transformByQState.getGumbyChatTabID(),
    })
    sessionPlanProgress['returnCode'] = StepProgress.Succeeded
}

export async function getValidCandidateProjects(): Promise<TransformationCandidateProject[]> {
    const openProjects = await getOpenProjects()
    return validateOpenProjects(openProjects)
}

export async function setTransformationToRunningState() {
    transformByQState.setToRunning()
    sessionPlanProgress['uploadCode'] = StepProgress.Pending
    sessionPlanProgress['buildCode'] = StepProgress.Pending
    sessionPlanProgress['transformCode'] = StepProgress.Pending
    sessionPlanProgress['returnCode'] = StepProgress.Pending

    codeTransformTelemetryState.setStartTime()

    //TODO[gumby]: change metric
    telemetry.codeTransform_jobStartedCompleteFromPopupDialog.emit({
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        codeTransformJavaSourceVersionsAllowed: JDKToTelemetryValue(
            transformByQState.getSourceJDKVersion()!
        ) as CodeTransformJavaSourceVersionsAllowed,
        codeTransformJavaTargetVersionsAllowed: JDKToTelemetryValue(
            transformByQState.getTargetJDKVersion()
        ) as CodeTransformJavaTargetVersionsAllowed,
        codeTransformProjectId: '',
        result: MetadataResult.Pass,
    })

    await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
    await vscode.commands.executeCommand(
        'aws.amazonq.showPlanProgressInHub',
        codeTransformTelemetryState.getStartTime()
    )

    await setContextVariables()

    await vscode.commands.executeCommand('aws.amazonq.refresh')
}

export async function postTransformationJob() {
    await vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', true)
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
        void vscode.window.showInformationMessage(CodeWhispererConstants.transformByQCompletedMessage)
    } else if (transformByQState.isPartiallySucceeded()) {
        void vscode.window.showInformationMessage(CodeWhispererConstants.transformByQPartiallyCompletedMessage)
    }

    if (transformByQState.getPayloadFilePath() !== '') {
        fs.rmSync(transformByQState.getPayloadFilePath(), { recursive: true, force: true }) // delete ZIP if it exists
    }
}

export async function transformationJobErrorHandler(error: any) {
    if (transformByQState.isCancelled()) {
        codeTransformTelemetryState.setResultStatus('JobCancelled')
        try {
            await stopJob(transformByQState.getJobId())
            void vscode.window.showErrorMessage(CodeWhispererConstants.transformByQCancelledMessage)
        } catch {
            void vscode.window.showErrorMessage(CodeWhispererConstants.errorStoppingJobMessage)
        }
    } else {
        transformByQState.setToFailed()
        codeTransformTelemetryState.setResultStatus('JobFailed')
        let displayedErrorMessage =
            transformByQState.getJobFailureErrorMessage() || CodeWhispererConstants.transformByQFailedMessage
        if (transformByQState.getJobFailureMetadata() !== '') {
            displayedErrorMessage += `: ${transformByQState.getJobFailureMetadata()}`
        }
        void vscode.window.showErrorMessage(displayedErrorMessage)
    }
    if (sessionPlanProgress['uploadCode'] !== StepProgress.Succeeded) {
        sessionPlanProgress['uploadCode'] = StepProgress.Failed
    }
    if (sessionPlanProgress['buildCode'] !== StepProgress.Succeeded) {
        sessionPlanProgress['buildCode'] = StepProgress.Failed
    }
    if (sessionPlanProgress['transformCode'] !== StepProgress.Succeeded) {
        sessionPlanProgress['transformCode'] = StepProgress.Failed
    }
    if (sessionPlanProgress['returnCode'] !== StepProgress.Succeeded) {
        sessionPlanProgress['returnCode'] = StepProgress.Failed
    }
    getLogger().error(`CodeTransformation: ${error}`)
}

export async function cleanupTransformationJob(intervalId: NodeJS.Timeout | undefined) {
    clearInterval(intervalId)
    transformByQState.setJobDefaults()
    await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
    await vscode.commands.executeCommand('aws.amazonq.refresh')
    void vscode.commands.executeCommand('aws.amazonq.showPlanProgressInHub', codeTransformTelemetryState.getStartTime())
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
        await vscode.commands.executeCommand('aws.amazonq.refresh')
        await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
        try {
            await stopJob(jobId)
        } catch {
            void vscode.window.showErrorMessage(CodeWhispererConstants.errorStoppingJobMessage)
        }
        telemetry.codeTransform_jobIsCancelledByUser.emit({
            codeTransformCancelSrcComponents: cancelSrc as CodeTransformCancelSrcComponents,
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
    }
}

async function setContextVariables() {
    await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', true)
    await vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', false)
    await vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', false)
    await vscode.commands.executeCommand('setContext', 'gumby.isSummaryAvailable', false)
    await vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.NotStarted)
    await vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
}
