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
import { transformByQState, StepProgress, DropdownStep, TransformByQReviewStatus } from '../models/model'
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
    getValidModules,
} from '../service/transformByQHandler'
import { QuickPickItem } from 'vscode'
import { MultiStepInputFlowController } from '../../shared//multiStepInputFlowController'
import path from 'path'
import { sleep } from '../../shared/utilities/timeoutUtils'
import * as he from 'he'
import { telemetry } from '../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { ToolkitError } from '../../shared/errors'

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

// TO-DO: consider adding progress bar here; for now not using one but keeping this function still; context will be used later to handle IDE restart
export async function startTransformByQWithProgress() {
    await startTransformByQ()
}

interface UserInputState {
    title: string
    step: number
    totalSteps: number
    targetLanguage: QuickPickItem
    targetVersion: QuickPickItem
    module: QuickPickItem
}

async function collectInputs(validModules: vscode.QuickPickItem[] | undefined) {
    // const targetLanguages: QuickPickItem[] = CodeWhispererConstants.targetLanguages.map(label => ({ label }))
    const state = {} as Partial<UserInputState>
    // only supporting target language of Java and target version of JDK17 for now, so skip to pickModule prompt
    transformByQState.setTargetJDKVersionToJDK17()
    await MultiStepInputFlowController.run(input => pickModule(input, state, validModules))
    // await MultiStepInputFlowController.run(input => pickTargetLanguage(input, state, targetLanguages, validModules))
    return state as UserInputState
}

async function pickModule(
    input: MultiStepInputFlowController,
    state: Partial<UserInputState>,
    validModules: vscode.QuickPickItem[] | undefined
) {
    const pick = await input.showQuickPick({
        title: CodeWhispererConstants.transformByQWindowTitle,
        step: DropdownStep.STEP_1,
        totalSteps: DropdownStep.STEP_1,
        placeholder: CodeWhispererConstants.selectModulePrompt,
        items: validModules!,
        shouldResume: () => Promise.resolve(true),
        ignoreFocusOut: false,
    })
    state.module = pick
    transformByQState.setModuleName(he.encode(state.module.label)) // encode to avoid HTML injection risk
}

export async function startTransformByQ() {
    await telemetry.amazonq_codeTransformInvoke.run(async span => {
        span.record({ codeTransform_SessionId: codeTransformTelemetryState.getSessionId() })
        let validModules: vscode.QuickPickItem[] | undefined
        try {
            validModules = await getValidModules()
        } catch (err) {
            getLogger().error('Failed to get valid modules: ', err)
            throw err
        }

        span.record({ codeTransform_SourceJavaVersion: transformByQState.getSourceJDKVersion() })

        const state = await collectInputs(validModules)

        const selection = await vscode.window.showWarningMessage(
            CodeWhispererConstants.dependencyDisclaimer,
            { modal: true },
            'Transform'
        )

        if (selection !== 'Transform') {
            throw new ToolkitError('Transform cancelled', { code: 'DidNotConfirmDisclaimer', cancelled: true })
        }

        transformByQState.setToRunning()
        transformByQState.setModulePath(state.module.description!)
        sessionPlanProgress['uploadCode'] = StepProgress.Pending
        sessionPlanProgress['buildCode'] = StepProgress.Pending
        sessionPlanProgress['transformCode'] = StepProgress.Pending
        sessionPlanProgress['returnCode'] = StepProgress.Pending
        const startTime = new Date()

        vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
        vscode.commands.executeCommand('aws.amazonq.showPlanProgressInHub', startTime.getTime())
        vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', true)
        vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', false)
        vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', false)
        resetReviewInProgress()

        await vscode.commands.executeCommand('aws.amazonq.refresh')

        let intervalId = undefined
        let errorMessage = ''
        try {
            intervalId = setInterval(() => {
                vscode.commands.executeCommand('aws.amazonq.showPlanProgressInHub', startTime.getTime())
            }, CodeWhispererConstants.progressIntervalMs)
            // step 1: CreateCodeUploadUrl and upload code
            await vscode.commands.executeCommand('aws.amazonq.refresh')
            await vscode.commands.executeCommand('aws.amazonq.transformationHub.focus')

            let uploadId = ''
            throwIfCancelled()
            try {
                // TODO: we want to track zip failures separately from uploadPayload failures
                const payloadFileName = await zipCode(state.module.description!)
                await vscode.commands.executeCommand('aws.amazonq.refresh') // so that button updates
                uploadId = await uploadPayload(payloadFileName)
            } catch (error) {
                errorMessage = 'Failed to zip code and upload it to S3'
                span.record({
                    codeTransform_ApiName: 'CreateUploadUrl',
                })
                throw new ToolkitError(errorMessage) // do not chain the error due to security issues (may contain the uploadUrl)
            }
            sessionPlanProgress['uploadCode'] = StepProgress.Succeeded
            await vscode.commands.executeCommand('aws.amazonq.refresh')

            await sleep(2000) // sleep before starting job to prevent ThrottlingException
            throwIfCancelled()

            // step 2: StartJob and store the returned jobId in TransformByQState
            let jobId = ''
            try {
                jobId = await startJob(uploadId)
            } catch (error) {
                errorMessage = 'Failed to start job'
                span.record({
                    codeTransform_ApiName: 'StartTransformation',
                })
                getLogger().error(errorMessage, error)
                throw new ToolkitError(errorMessage, { cause: error as Error })
            }
            transformByQState.setJobId(jobId)
            span.record({ codeTransform_JobId: jobId })
            await vscode.commands.executeCommand('aws.amazonq.refresh')

            await sleep(2000) // sleep before polling job to prevent ThrottlingException
            throwIfCancelled()

            // intermediate step: show transformation-plan.md file
            // TO-DO: on IDE restart, resume here if a job was ongoing
            try {
                await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForGettingPlan)
            } catch (error) {
                errorMessage = 'Failed to poll transformation job for plan availability, or job itself failed'
                span.record({
                    codeTransform_ApiName: 'GetTransformation',
                })
                getLogger().error(errorMessage, error)
                throw new ToolkitError(errorMessage, { cause: error as Error })
            }
            let plan = undefined
            try {
                plan = await getTransformationPlan(jobId)
            } catch (error) {
                errorMessage = 'Failed to get transformation plan'
                span.record({
                    codeTransform_ApiName: 'GetTransformationPlan',
                })
                getLogger().error(errorMessage, error)
                throw new ToolkitError(errorMessage, { cause: error as Error })
            }
            sessionPlanProgress['buildCode'] = StepProgress.Succeeded
            const planFilePath = path.join(os.tmpdir(), 'transformation-plan.md')
            fs.writeFileSync(planFilePath, plan)
            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(planFilePath))
            transformByQState.setPlanFilePath(planFilePath)
            vscode.commands.executeCommand('setContext', 'gumby.isPlanAvailable', true)

            // step 3: poll until artifacts are ready to download
            throwIfCancelled()
            let status = ''
            try {
                status = await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForCheckingDownloadUrl)
            } catch (error) {
                errorMessage = 'Failed to get transformation job status'
                span.record({
                    codeTransform_ApiName: 'GetTransformation',
                })
                getLogger().error(errorMessage, error)
                throw new ToolkitError(errorMessage, { cause: error as Error })
            }

            span.record({
                codeTransform_ResultStatusMessage: status,
            })

            if (!(status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED')) {
                errorMessage = 'Failed to complete transformation'
                getLogger().error(errorMessage)
                sessionPlanProgress['transformCode'] = StepProgress.Failed

                throw new ToolkitError(errorMessage, { code: 'JobDidNotSucceed' })
            }

            sessionPlanProgress['transformCode'] = StepProgress.Succeeded
            transformByQState.setToSucceeded()
            if (status === 'PARTIALLY_COMPLETED') {
                transformByQState.setToPartiallySucceeded()
            }

            await vscode.commands.executeCommand('aws.amazonq.transformationHub.reviewChanges.reveal')
            await vscode.commands.executeCommand('aws.amazonq.refresh')
            sessionPlanProgress['returnCode'] = StepProgress.Succeeded
        } catch (error) {
            if (transformByQState.isCancelled()) {
                stopJob(transformByQState.getJobId())
                vscode.window.showErrorMessage(CodeWhispererConstants.transformByQCancelledMessage, { modal: true })
            } else {
                transformByQState.setToFailed()
                let displayedErrorMessage = CodeWhispererConstants.transformByQFailedMessage
                if (errorMessage !== '') {
                    displayedErrorMessage = errorMessage
                }
                if (transformByQState.getJobFailureReason() !== '') {
                    displayedErrorMessage += `: ${transformByQState.getJobFailureReason()}`
                }
                vscode.window.showErrorMessage(displayedErrorMessage, { modal: true })
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
        } finally {
            vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', true)
            const durationInMs = new Date().getTime() - startTime.getTime()

            if (state.module) {
                sessionJobHistory = processHistory(
                    sessionJobHistory,
                    convertDateToTimestamp(startTime),
                    transformByQState.getModuleName(),
                    transformByQState.getStatus(),
                    convertToTimeString(durationInMs),
                    transformByQState.getJobId()
                )
            }
            if (transformByQState.isSucceeded()) {
                vscode.window.showInformationMessage(CodeWhispererConstants.transformByQCompleted)
            }
            await sleep(2000) // needed as a buffer to allow TransformationHub to update before state is updated
            clearInterval(intervalId)
            transformByQState.setToNotStarted() // so that the "Transform by Q" button resets
            vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
            await vscode.commands.executeCommand('aws.amazonq.refresh')
            vscode.commands.executeCommand('aws.amazonq.showPlanProgressInHub', startTime.getTime())
        }
        await sleep(2000) // needed as a buffer to allow TransformationHub to update before state is updated
        clearInterval(intervalId)
        transformByQState.setToNotStarted() // so that the "Transform by Q" button resets
        transformByQState.setPolledJobStatus('') // reset polled job status too
        vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
        await vscode.commands.executeCommand('aws.amazonq.refresh')
        vscode.commands.executeCommand('aws.amazonq.showPlanProgressInHub', startTime.getTime())
    })
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

export async function confirmStopTransformByQ(jobId: string) {
    const resp = await vscode.window.showWarningMessage(
        CodeWhispererConstants.stopTransformByQMessage,
        { modal: true },
        stopTransformByQButton
    )
    if (resp === stopTransformByQButton && transformByQState.isRunning()) {
        getLogger().verbose('User requested to stop transform by Q. Stopping transform by Q.')
        transformByQState.setToCancelled()
        await vscode.commands.executeCommand('aws.amazonq.refresh')
        vscode.commands.executeCommand('setContext', 'gumby.isStopButtonAvailable', false)
        stopJob(jobId)
    }
}

function resetReviewInProgress() {
    vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.NotStarted)
    vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
}
