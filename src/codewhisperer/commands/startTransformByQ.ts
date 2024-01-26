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
import { transformByQState, StepProgress, TransformByQReviewStatus } from '../models/model'
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
    validateProjectSelection,
} from '../service/transformByQHandler'
import { QuickPickItem } from 'vscode'
import path from 'path'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { encodeHTML } from '../../shared/utilities/textUtilities'
import {
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
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'

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

interface UserInputState {
    title: string
    step: number
    totalSteps: number
    targetLanguage: QuickPickItem
    targetVersion: QuickPickItem
    project: QuickPickItem
}

async function collectInput(validProjects: vscode.QuickPickItem[]) {
    const state = {} as Partial<UserInputState>
    transformByQState.setTargetJDKVersionToJDK17()
    const pick = await vscode.window.showQuickPick(validProjects, {
        title: CodeWhispererConstants.transformByQWindowTitle,
        placeHolder: CodeWhispererConstants.selectModulePrompt,
    })
    if (pick) {
        state.project = pick
        transformByQState.setProjectName(encodeHTML(state.project.label)) // encode to avoid HTML injection risk
    }
    return state as UserInputState
}

export async function startTransformByQ() {
    const client = new DefaultCloudWatchLogsClient('regionCodeHere')

    const request = {
        logGroupName: 'logGroupNameHere',
        logStreamName: 'logStreamNameHere',
        logEvents: [{ timestamp: Date.now(), message: 'testing from gumby' }],
    }

    const response = await client.putLogEvents(request)

    console.log('CW Logs response = ' + response)

    return -1

    let intervalId = undefined

    // Validate inputs. If failed, Error will be thrown and execution stops
    const userInputState = await validateTransformationJob()

    // Set the default state variables for our store and the UI
    await setTransformationToRunningState(userInputState)

    try {
        // Set web view UI to poll for progress
        intervalId = setInterval(() => {
            void vscode.commands.executeCommand(
                'aws.amazonq.showPlanProgressInHub',
                codeTransformTelemetryState.getStartTime()
            )
        }, CodeWhispererConstants.progressIntervalMs)

        // step 1: CreateCodeUploadUrl and upload code
        const uploadId = await preTransformationUploadCode(userInputState)

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
        await postTransformationJob(userInputState)
        await cleanupTransformationJob(intervalId)
    }
}

export async function preTransformationUploadCode(userInputState: UserInputState) {
    await vscode.commands.executeCommand('aws.amazonq.refresh')
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.focus')

    let uploadId = ''
    let payloadFilePath = ''
    throwIfCancelled()
    try {
        payloadFilePath = await zipCode(userInputState.project.description!)
        transformByQState.setPayloadFilePath(payloadFilePath)
        await vscode.commands.executeCommand('aws.amazonq.refresh') // so that button updates
        uploadId = await uploadPayload(payloadFilePath)
    } catch (error) {
        const errorMessage = 'Failed to upload code'
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
        const errorMessage = 'Failed to poll transformation job for plan availability, or job itself failed'
        getLogger().error(errorMessage, error)
        throw new ToolkitError(errorMessage, { cause: error as Error })
    }
    let plan = undefined
    try {
        plan = await getTransformationPlan(jobId)
    } catch (error) {
        const errorMessage = 'Failed to get transformation plan'
        getLogger().error(errorMessage, error)
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

export async function pollTransformationStatusUntilComplete(jobId: string) {
    let status = ''
    try {
        status = await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForCheckingDownloadUrl)
    } catch (error) {
        const errorMessage = 'Failed to get transformation job status'
        getLogger().error(errorMessage, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new ToolkitError(errorMessage, { cause: error as Error })
    }

    return status
}

export async function finalizeTransformationJob(status: string) {
    if (!(status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED')) {
        const errorMessage = 'Failed to complete transformation'
        getLogger().error(errorMessage)
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
    sessionPlanProgress['returnCode'] = StepProgress.Succeeded
}

export async function validateTransformationJob() {
    let openProjects: vscode.QuickPickItem[] = []
    try {
        openProjects = await getOpenProjects()
    } catch (err) {
        getLogger().error('Failed to get open projects: ', err)
        throw err
    }
    const userInputState = await collectInput(openProjects)

    if (!userInputState.project) {
        throw new ToolkitError('No project selected', { code: 'NoProjectSelected' })
    }

    try {
        await validateProjectSelection(userInputState.project)
    } catch (err) {
        getLogger().error('Selected project is not Java 8, not Java 11, or does not use Maven', err)
        throw err
    }

    const selection = await vscode.window.showWarningMessage(
        CodeWhispererConstants.dependencyDisclaimer,
        { modal: true },
        'Transform'
    )

    if (selection !== 'Transform') {
        telemetry.codeTransform_jobIsCanceledFromUserPopupClick.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
        throw new ToolkitError('Transform cancelled', { code: 'DidNotConfirmDisclaimer', cancelled: true })
    } else {
        telemetry.codeTransform_jobIsStartedFromUserPopupClick.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
    }

    return userInputState
}

export async function setTransformationToRunningState(userInputState: UserInputState) {
    transformByQState.setToRunning()
    transformByQState.setProjectPath(userInputState.project.description!)
    sessionPlanProgress['uploadCode'] = StepProgress.Pending
    sessionPlanProgress['buildCode'] = StepProgress.Pending
    sessionPlanProgress['transformCode'] = StepProgress.Pending
    sessionPlanProgress['returnCode'] = StepProgress.Pending

    codeTransformTelemetryState.setStartTime()

    telemetry.codeTransform_jobStartedCompleteFromPopupDialog.emit({
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        codeTransformJavaSourceVersionsAllowed: JDKToTelemetryValue(
            transformByQState.getSourceJDKVersion()
        ) as CodeTransformJavaSourceVersionsAllowed,
        codeTransformJavaTargetVersionsAllowed: JDKToTelemetryValue(
            transformByQState.getTargetJDKVersion()
        ) as CodeTransformJavaTargetVersionsAllowed,
        result: MetadataResult.Pass,
    })

    await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
    await vscode.commands.executeCommand(
        'aws.amazonq.showPlanProgressInHub',
        codeTransformTelemetryState.getStartTime()
    )
    await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', true)
    await vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', false)
    await vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', false)
    await vscode.commands.executeCommand('setContext', 'gumby.isSummaryAvailable', false)
    await resetReviewInProgress()

    await vscode.commands.executeCommand('aws.amazonq.refresh')
}

export async function postTransformationJob(userInputState: UserInputState) {
    await vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', true)
    const durationInMs = calculateTotalLatency(codeTransformTelemetryState.getStartTime())
    const resultStatusMessage = codeTransformTelemetryState.getResultStatus()

    // Note: IntelliJ implementation of ResultStatusMessage includes additional metadata such as jobId.
    telemetry.codeTransform_totalRunTime.emit({
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        codeTransformResultStatusMessage: resultStatusMessage,
        codeTransformRunTimeLatency: durationInMs,
        result: resultStatusMessage === 'JobCompletedSuccessfully' ? MetadataResult.Pass : MetadataResult.Fail,
        reason: resultStatusMessage,
    })

    if (userInputState.project) {
        sessionJobHistory = processHistory(
            sessionJobHistory,
            convertDateToTimestamp(new Date(codeTransformTelemetryState.getStartTime())),
            transformByQState.getProjectName(),
            transformByQState.getStatus(),
            convertToTimeString(durationInMs),
            transformByQState.getJobId()
        )
    }
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
        if (transformByQState.getJobFailureReason() !== '') {
            displayedErrorMessage += `: ${transformByQState.getJobFailureReason()}`
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
    // Log error to VSCode logs
    getLogger().error('Amazon Q Code Transform', error)
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

export async function confirmStopTransformByQ(
    jobId: string,
    cancelSrc: CancelActionPositions = CancelActionPositions.BottomHubPanel
) {
    const resp = await vscode.window.showWarningMessage(
        CodeWhispererConstants.stopTransformByQMessage,
        { modal: true },
        stopTransformByQButton
    )
    if (resp === stopTransformByQButton && transformByQState.isRunning()) {
        getLogger().verbose('User requested to stop transform by Q. Stopping transform by Q.')
        transformByQState.setToCancelled()
        await vscode.commands.executeCommand('aws.amazonq.refresh')
        await vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
        try {
            await stopJob(jobId)
        } catch {
            void vscode.window.showErrorMessage(CodeWhispererConstants.errorStoppingJobMessage)
        }
        telemetry.codeTransform_jobIsCancelledByUser.emit({
            codeTransformCancelSrcComponents: cancelSrc,
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
    }
}

async function resetReviewInProgress() {
    await vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.NotStarted)
    await vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
}
