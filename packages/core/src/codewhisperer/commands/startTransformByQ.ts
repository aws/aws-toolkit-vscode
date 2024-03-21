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
import { transformByQState, StepProgress, TransformByQReviewStatus, JDKVersion, DropdownStep } from '../models/model'
import { convertToTimeString, convertDateToTimestamp } from '../../shared/utilities/textUtilities'
import {
    throwIfCancelled,
    startJob,
    stopJob,
    uploadPayload,
    getTransformationPlan,
    zipCode,
    pollTransformationJob,
    getOpenProjects,
    getVersionData,
    validateOpenProjects,
} from '../service/transformByQHandler'
import { QuickPickItem } from 'vscode'
import { MultiStepInputFlowController } from '../../shared//multiStepInputFlowController'
import path from 'path'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { encodeHTML, getStringHash } from '../../shared/utilities/textUtilities'
import {
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
    project: QuickPickItem | undefined
    sourceJavaVersion: QuickPickItem | undefined
}

async function collectInput(validProjects: Map<vscode.QuickPickItem, JDKVersion | undefined>) {
    const state = {} as Partial<UserInputState>
    transformByQState.setTargetJDKVersion(JDKVersion.JDK17)
    await MultiStepInputFlowController.run(input => pickProject(input, state, validProjects))
    if (!state.project) {
        throw new Error('No project selected')
    }
    const versionsArray = [JDKVersion.JDK8, JDKVersion.JDK11]
    const validSourceVersions: vscode.QuickPickItem[] = versionsArray.map(version => ({
        label: version,
    }))
    validSourceVersions.push({ label: 'Other' }) // if user selects 'Other', terminate execution
    await MultiStepInputFlowController.run(input => pickSourceVersion(input, state, validSourceVersions))
    if (!state.sourceJavaVersion) {
        throw new Error('No version selected')
    } else if (state.sourceJavaVersion.label === 'Other') {
        telemetry.codeTransform_jobStartedCompleteFromPopupDialog.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformJavaSourceVersionsAllowed: 'Other',
            codeTransformJavaTargetVersionsAllowed: JDKToTelemetryValue(
                transformByQState.getTargetJDKVersion()
            ) as CodeTransformJavaTargetVersionsAllowed,
            result: MetadataResult.Fail,
            codeTransformProjectId: getStringHash(state.project.label),
        })
        await vscode.window.showErrorMessage(
            CodeWhispererConstants.unsupportedJavaVersionSelectedMessage.replace(
                'LINK_HERE',
                CodeWhispererConstants.linkToDocsHome
            )
        )
        throw new Error('Other version selected')
    }
    return state as UserInputState
}

async function pickProject(
    input: MultiStepInputFlowController,
    state: Partial<UserInputState>,
    validProjects: Map<vscode.QuickPickItem, JDKVersion | undefined>
) {
    const pick = await input.showQuickPick({
        title: CodeWhispererConstants.transformByQWindowTitle,
        step: DropdownStep.STEP_1,
        totalSteps: DropdownStep.STEP_2,
        placeholder: CodeWhispererConstants.selectProjectPrompt,
        items: Array.from(validProjects.keys()),
        shouldResume: () => Promise.resolve(false),
    })
    state.project = pick
    transformByQState.setProjectName(encodeHTML(state.project.label)) // encode to avoid HTML injection risk
    const javaVersion = validProjects.get(pick)
    transformByQState.setSourceJDKVersion(javaVersion)
}

async function pickSourceVersion(
    input: MultiStepInputFlowController,
    state: Partial<UserInputState>,
    validSourceVersions: vscode.QuickPickItem[]
) {
    let detectedJavaVersion = undefined
    const sourceJDKVersion = transformByQState.getSourceJDKVersion()
    if (sourceJDKVersion === JDKVersion.JDK8) {
        detectedJavaVersion = validSourceVersions[0]
    } else if (sourceJDKVersion === JDKVersion.JDK11) {
        detectedJavaVersion = validSourceVersions[1]
    }
    let placeholderText = ''
    if (sourceJDKVersion === JDKVersion.JDK8 || sourceJDKVersion === JDKVersion.JDK11) {
        placeholderText = `We found Java ${sourceJDKVersion}. Select a different version if incorrect.`
    } else if (sourceJDKVersion === JDKVersion.UNSUPPORTED) {
        placeholderText = 'We found an unsupported Java version. Select your version here if incorrect.'
    } else {
        placeholderText = "Choose your project's Java version here." // if no .class files found or if javap fails
    }
    const pick = await input.showQuickPick({
        title: CodeWhispererConstants.transformByQWindowTitle,
        step: DropdownStep.STEP_2,
        totalSteps: DropdownStep.STEP_2,
        placeholder: placeholderText,
        items: validSourceVersions,
        activeItem: detectedJavaVersion,
        shouldResume: () => Promise.resolve(false),
    })
    state.sourceJavaVersion = pick
    if (pick === validSourceVersions[0]) {
        transformByQState.setSourceJDKVersion(JDKVersion.JDK8)
    } else if (pick === validSourceVersions[1]) {
        transformByQState.setSourceJDKVersion(JDKVersion.JDK11)
    } else if (pick === validSourceVersions[2]) {
        // corresponds with the 'Other' option
        transformByQState.setSourceJDKVersion(JDKVersion.UNSUPPORTED)
    }
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

async function validateJavaHome() {
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
        let javaHomePrompt = `${
            CodeWhispererConstants.enterJavaHomeMessage
        } ${transformByQState.getSourceJDKVersion()}. `
        if (os.platform() === 'win32') {
            javaHomePrompt += CodeWhispererConstants.windowsJavaHomeHelpMessage.replace(
                'JAVA_VERSION_HERE',
                transformByQState.getSourceJDKVersion()!
            )
        } else {
            const jdkVersion = transformByQState.getSourceJDKVersion()
            if (jdkVersion === JDKVersion.JDK8) {
                javaHomePrompt += CodeWhispererConstants.nonWindowsJava8HomeHelpMessage
            } else if (jdkVersion === JDKVersion.JDK11) {
                javaHomePrompt += CodeWhispererConstants.nonWindowsJava11HomeHelpMessage
            }
        }
        // means either javaVersionUsedByMaven is undefined or it does not match the project JDK
        const javaHome = await vscode.window.showInputBox({
            title: CodeWhispererConstants.transformByQWindowTitle,
            prompt: javaHomePrompt,
            ignoreFocusOut: true,
        })
        if (!javaHome || !javaHome.trim()) {
            throw new Error('No java home path provided')
        }
        transformByQState.setJavaHome(javaHome.trim())
        getLogger().info(
            `CodeTransformation: using JAVA_HOME = ${transformByQState.getJavaHome()} since source JDK does not match Maven JDK`
        )
    }
}

export async function startTransformByQ() {
    let intervalId = undefined

    // Validate inputs. If failed, Error will be thrown and execution stops
    const userInputState = await validateTransformationJob()

    await setMaven()

    await validateJavaHome()

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
        void vscode.window.showInformationMessage(CodeWhispererConstants.compilingProjectMessage)
        payloadFilePath = await zipCode()
        transformByQState.setPayloadFilePath(payloadFilePath)
        await vscode.commands.executeCommand('aws.amazonq.refresh') // so that button updates
        void vscode.window.showInformationMessage(CodeWhispererConstants.submittedProjectMessage)
        uploadId = await uploadPayload(payloadFilePath)
    } catch (err) {
        const errorMessage = `Failed to upload code due to ${(err as Error).message}`
        getLogger().error(errorMessage)
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            result: MetadataResult.Fail,
            reason: 'UploadArchiveFailed',
        })
        throw err
    }

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
        const errorMessage = CodeWhispererConstants.failedToStartJobMessage
        telemetry.codeTransform_logGeneralError.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            codeTransformApiErrorMessage: errorMessage,
            result: MetadataResult.Fail,
            reason: 'StartJobFailed',
        })
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Start job failed')
    }
    transformByQState.setJobId(encodeHTML(jobId))
    await vscode.commands.executeCommand('aws.amazonq.refresh')

    await sleep(2000) // sleep before polling job to prevent ThrottlingException
    throwIfCancelled()
    sessionPlanProgress['uploadCode'] = StepProgress.Succeeded

    return jobId
}

export async function pollTransformationStatusUntilPlanReady(jobId: string) {
    try {
        await pollTransformationJob(jobId, CodeWhispererConstants.validStatesForGettingPlan)
    } catch (error) {
        const errorMessage = CodeWhispererConstants.failedToCompleteJobMessage
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Poll job failed')
    }
    let plan = undefined
    try {
        plan = await getTransformationPlan(jobId)
    } catch (error) {
        const errorMessage = CodeWhispererConstants.failedToCompleteJobMessage
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Get plan failed')
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
        const errorMessage = CodeWhispererConstants.failedToCompleteJobMessage
        getLogger().error(`CodeTransformation: ${errorMessage}`, error)
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Poll job failed')
    }

    return status
}

export async function finalizeTransformationJob(status: string) {
    if (!(status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED')) {
        const errorMessage = CodeWhispererConstants.failedToCompleteJobMessage
        getLogger().error(`CodeTransformation: ${errorMessage}`)
        sessionPlanProgress['transformCode'] = StepProgress.Failed
        transformByQState.setJobFailureErrorMessage(errorMessage)
        throw new Error('Job was not successful nor partially successful')
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
        getLogger().error(`CodeTransformation: Failed to get open projects: ${err}`)
        throw err
    }

    let validProjects = undefined
    try {
        validProjects = await validateOpenProjects(openProjects)
    } catch (err) {
        getLogger().error(`CodeTransformation: No open projects contain a .java file or a pom.xml file ${err}`)
        throw err
    }

    const userInputState = await collectInput(validProjects)

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
        throw new Error('Did not confirm disclaimer')
    } else {
        telemetry.codeTransform_jobIsStartedFromUserPopupClick.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
    }
    transformByQState.setProjectPath(userInputState.project!.description!)
    return userInputState
}

export async function setTransformationToRunningState(userInputState: UserInputState) {
    transformByQState.setToRunning()
    sessionPlanProgress['uploadCode'] = StepProgress.Pending
    sessionPlanProgress['buildCode'] = StepProgress.Pending
    sessionPlanProgress['transformCode'] = StepProgress.Pending
    sessionPlanProgress['returnCode'] = StepProgress.Pending

    codeTransformTelemetryState.setStartTime()

    const projectPath = userInputState.project?.label
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

    await setContextVariables()

    await vscode.commands.executeCommand('aws.amazonq.refresh')
}

export async function postTransformationJob(userInputState: UserInputState) {
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
        void vscode.window
            .showInformationMessage(
                CodeWhispererConstants.transformByQPartiallyCompletedMessage,
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
    if (transformByQState.isCancelled()) {
        codeTransformTelemetryState.setResultStatus('JobCancelled')
        try {
            await stopJob(transformByQState.getJobId())
            void vscode.window
                .showErrorMessage(
                    CodeWhispererConstants.transformByQCancelledMessage,
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
                    CodeWhispererConstants.errorStoppingJobMessage,
                    CodeWhispererConstants.amazonQFeedbackText
                )
                .then(choice => {
                    if (choice === CodeWhispererConstants.amazonQFeedbackText) {
                        void submitFeedback.execute(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                    }
                })
        }
    } else {
        transformByQState.setToFailed()
        codeTransformTelemetryState.setResultStatus('JobFailed')
        let displayedErrorMessage = `${
            CodeWhispererConstants.failedToCompleteJobMessage
        } ${transformByQState.getJobFailureErrorMessage()}`
        if (transformByQState.getJobFailureMetadata() !== '') {
            displayedErrorMessage += transformByQState.getJobFailureMetadata()
        }
        void vscode.window
            .showErrorMessage(displayedErrorMessage, CodeWhispererConstants.amazonQFeedbackText)
            .then(choice => {
                if (choice === CodeWhispererConstants.amazonQFeedbackText) {
                    void submitFeedback.execute(placeholder, CodeWhispererConstants.amazonQFeedbackKey)
                }
            })
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
    getLogger().error(`CodeTransformation: ${error.message}`)
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
            codeTransformCancelSrcComponents: cancelSrc,
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
