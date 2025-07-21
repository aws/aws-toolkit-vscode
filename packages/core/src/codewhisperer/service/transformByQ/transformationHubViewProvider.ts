/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import * as CodeWhispererConstants from '../../models/constants'
import {
    JDKVersion,
    StepProgress,
    TransformationType,
    jobPlanProgress,
    sessionJobHistory,
    transformByQState,
} from '../../models/model'
import { getLogger } from '../../../shared/logger/logger'
import { getTransformationSteps, downloadAndExtractResultArchive } from './transformApiHandler'
import {
    TransformationSteps,
    ProgressUpdates,
    TransformationStatus,
} from '../../../codewhisperer/client/codewhispereruserclient'
import { codeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import { startInterval, pollTransformationStatusUntilComplete } from '../../commands/startTransformByQ'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { convertToTimeString, isWithin30Days } from '../../../shared/datetime'
import { AuthUtil } from '../../util/authUtil'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { setMaven } from './transformFileHandler'

interface HistoryObject {
    startTime: string
    projectName: string
    status: string
    duration: string
    diffPath: string
    summaryPath: string
    jobId: string
}

export class TransformationHubViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aws.amazonq.transformationHub'
    private _view?: vscode.WebviewView
    private lastClickedButton: string = ''
    private _extensionUri: vscode.Uri = globals.context.extensionUri
    private transformationHistory: HistoryObject[] = []
    constructor() {}
    static #instance: TransformationHubViewProvider

    public async updateContent(
        button: 'job history' | 'plan progress',
        startTime: number = CodeTransformTelemetryState.instance.getStartTime(),
        historyFileUpdated?: boolean
    ) {
        this.lastClickedButton = button
        if (historyFileUpdated) {
            this.transformationHistory = readHistoryFile()
        }
        if (this._view) {
            if (this.lastClickedButton === 'job history') {
                clearInterval(transformByQState.getIntervalId())
                transformByQState.setIntervalId(undefined)
                this._view!.webview.html = this.showJobHistory()
            } else {
                if (transformByQState.getIntervalId() === undefined && transformByQState.isRunning()) {
                    startInterval()
                }
                await this.showPlanProgress(startTime)
                    .then((jobPlanProgress) => {
                        this._view!.webview.html = jobPlanProgress
                    })
                    .catch((e) => {
                        getLogger().error('showPlanProgress failed: %s', (e as Error).message)
                    })
            }
        }
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView

        this._view.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'refreshJob':
                    this.refreshJob(message.jobId, message.currentStatus, message.projectName)
                    break
                case 'openSummaryPreview':
                    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(message.filePath))
                    break
                case 'openDiffFile':
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.filePath))
                    break
            }
        })

        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        }

        this.transformationHistory = readHistoryFile()
        if (this.lastClickedButton === 'job history') {
            this._view!.webview.html = this.showJobHistory()
        } else {
            this.showPlanProgress(globals.clock.Date.now())
                .then((jobPlanProgress) => {
                    this._view!.webview.html = jobPlanProgress
                })
                .catch((e) => {
                    getLogger().error('showPlanProgress failed: %s', (e as Error).message)
                })
        }
    }

    private showJobHistory(): string {
        const jobsToDisplay: HistoryObject[] = [...this.transformationHistory]
        if (transformByQState.isRunning()) {
            const current = sessionJobHistory[transformByQState.getJobId()]
            jobsToDisplay.unshift({
                startTime: current.startTime,
                projectName: current.projectName,
                status: current.status,
                duration: current.duration,
                diffPath: '',
                summaryPath: '',
                jobId: transformByQState.getJobId(),
            })
        }
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
            <title>Transformation Hub</title>
            <style>
                td, th {
                    padding: 10px;
                }
            </style>
            </head>
            <body>
            <p><b>Transformation History</b></p>
            <p>This table lists the most recent jobs that you have run in the past 30 days. 
            To open the diff patch and summary files, click the provided links. 
            Jobs with a status of FAILED may still be in progress. 
            Resume them within 12 hours of starting the job to get an updated job status and artifacts. Click the refresh icon to do so. 
            The diff patch and summary will appear once they are available.
            </p>
            ${
                jobsToDisplay.length === 0
                    ? `<p>${CodeWhispererConstants.nothingToShowMessage}</p>`
                    : this.getTableMarkup(jobsToDisplay)
            }
            <script>
                const vscode = acquireVsCodeApi();
                
                document.addEventListener('click', (event) => {
                    if (event.target.classList.contains('refresh-btn')) {
                        const jobId = event.target.getAttribute('row-id');
                        const projectName = event.target.getAttribute('proj-name');
                        const status = event.target.getAttribute('status');
                        vscode.postMessage({
                            command: 'refreshJob',
                            jobId: jobId,
                            projectName: projectName,
                            currentStatus: status
                        });
                    }

                    if (event.target.classList.contains('summary-link')) {
                        event.preventDefault();
                        const summaryPath = event.target.getAttribute('summary-path');
                        vscode.postMessage({
                            command: 'openSummaryPreview',
                            filePath: summaryPath
                        });
                    }

                    if (event.target.classList.contains('diff-link')) {
                        event.preventDefault();
                        const diffPath = event.target.getAttribute('diff-path');
                        vscode.postMessage({
                            command: 'openDiffFile',
                            filePath: diffPath
                        });
                    }
                });
            </script>
            </body>
            </html>`
    }

    private getTableMarkup(history: HistoryObject[]) {
        return `
            <style>
            .refresh-btn {
                border: none;
                background: none;
                cursor: pointer;
                font-size: 16px;
            }
            .refresh-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }
            td:last-child {
                text-align: center;
            }
            </style>
            <table border="1" style="border-collapse:collapse">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Project</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Diff Patch</th>
                        <th>Summary File</th>
                        <th>Job Id</th>
                        <th>Refresh Job</th>
                    </tr>
                </thead>
                <tbody>
                ${history
                    .map(
                        (job) => `
                    <tr>
                        <td>${job.startTime}</td>
                        <td>${job.projectName}</td>
                        <td>${job.status === 'FAILED_BE' ? 'FAILED' : job.status}</td>
                        <td>${job.duration}</td>
                        <td>${job.diffPath ? `<a href="#" class="diff-link" diff-path="${job.diffPath}">diff.patch</a>` : ''}</td>
                        <td>${job.summaryPath ? `<a href="#" class="summary-link" summary-path="${job.summaryPath}">summary.md</a>` : ''}</td>
                        <td>${job.jobId}</td>
                        <td>
                            <button 
                                class="refresh-btn" 
                                row-id="${job.jobId}"
                                proj-name="${job.projectName}"
                                status="${job.status}"
                                ${
                                    transformByQState.isRunning() || transformByQState.isRefreshInProgress()
                                        ? 'disabled title="A job is ongoing"'
                                        : job.status === 'CANCELLED' ||
                                            job.status === 'STOPPED' ||
                                            job.status === 'FAILED_BE'
                                          ? 'disabled title="Unable to refresh this job"'
                                          : ''
                                }
                                
                            >
                                ↻
                            </button>
                        </td>
                    </tr>
                `
                    )
                    .join('')}
                </tbody>
            </table>
        `
    }

    private async refreshJob(jobId: string, currentStatus: string, projectName: string) {
        // fetch status from server
        let status = ''
        let duration = ''
        if (currentStatus === 'COMPLETED' || currentStatus === 'PARTIALLY_COMPLETED') {
            // job is already completed, no need to fetch status
            status = currentStatus
        } else {
            try {
                const response = await codeWhispererClient.codeModernizerGetCodeTransformation({
                    transformationJobId: jobId,
                    profileArn: undefined,
                })
                status = response.transformationJob.status!
                if (response.transformationJob.endExecutionTime && response.transformationJob.creationTime) {
                    duration = convertToTimeString(
                        response.transformationJob.endExecutionTime.getTime() -
                            response.transformationJob.creationTime.getTime()
                    )
                }

                getLogger().info(
                    'Code Transformation: Job Id: %s\nFetched status: %s\nDuration: %s',
                    jobId,
                    status,
                    duration
                )
            } catch (error) {
                getLogger().error(
                    'Code Transformation: Error fetching status (job id: %s): %s',
                    jobId,
                    (error as Error).message
                )
                return
            }
        }

        // retrieve artifacts and updated duration if available
        let jobHistoryPath: string = ''
        if (status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED') {
            // artifacts should be available to download
            jobHistoryPath = await this.retrieveArtifacts(jobId, projectName)

            // delete metadata file, if it exists
            fs.rmSync(path.join(os.homedir(), '.aws', 'transform', projectName, jobId, 'metadata.txt'), { force: true })
        } else if (CodeWhispererConstants.validStatesForBuildSucceeded.includes(status)) {
            // still in progress on server side
            if (transformByQState.isRunning()) {
                getLogger().warn(
                    'Code Transformation: There is a job currently running (id: %s). Cannot resume another job (id: %s)',
                    transformByQState.getJobId(),
                    jobId
                )
                return
            }
            transformByQState.setRefreshInProgress(true)
            const messenger = transformByQState.getChatMessenger()
            if (messenger) {
                messenger.sendJobRefreshInProgressMessage(ChatSessionManager.Instance.getSession().tabID!, jobId)
            }

            // set state to prepare to resume job
            transformByQState.setJobId(jobId)
            transformByQState.setPolledJobStatus(status)
            try {
                transformByQState.setJobHistoryPath(path.join(os.homedir(), '.aws', 'transform', projectName, jobId))
                const metadataFile = fs.readFileSync(path.join(transformByQState.getJobHistoryPath(), 'metadata.txt'), {
                    encoding: 'utf8',
                    flag: 'r',
                })
                const metadata = metadataFile.split('\t')
                transformByQState.setTransformationType(metadata[1] as TransformationType)
                transformByQState.setSourceJDKVersion(metadata[2] as JDKVersion)
                transformByQState.setTargetJDKVersion(metadata[3] as JDKVersion)
                transformByQState.setCustomDependencyVersionFilePath(metadata[4])
                transformByQState.setPayloadFilePath(
                    path.join(os.homedir(), '.aws', 'transform', projectName, jobId, 'zipped-code.zip')
                )
                setMaven()
                transformByQState.setCustomBuildCommand(metadata[5])
                transformByQState.setTargetJavaHome(metadata[6])
                transformByQState.setProjectPath(metadata[7])
                transformByQState.setStartTime(metadata[8])
            } catch (e: any) {
                // reaching this means there was most likely a problem with the metadata file
                getLogger().error('Code Transformation: Error setting job state: %s', (e as Error).message)
                transformByQState.setJobDefaults()
                if (messenger) {
                    messenger.sendJobFinishedMessage(
                        ChatSessionManager.Instance.getSession().tabID!,
                        "Sorry, I couldn't refresh the job. Please try again or start a new transformation."
                    )
                }
                void vscode.window.showErrorMessage(`There was an error refreshing this job. Job Id: ${jobId}`)
                return
            }

            // resume polling job
            try {
                this.updateContent('job history') // refreshing the table disables all jobs' refresh buttons while this one is polling
                status = await pollTransformationStatusUntilComplete(
                    jobId,
                    AuthUtil.instance.regionProfileManager.activeRegionProfile
                )
                if (
                    CodeWhispererConstants.validStatesForCheckingDownloadUrl.includes(status) &&
                    !CodeWhispererConstants.failureStates.includes(status)
                ) {
                    duration = convertToTimeString(
                        new Date().getTime() - new Date(transformByQState.getStartTime()).getTime()
                    )
                    jobHistoryPath = await this.retrieveArtifacts(jobId, projectName)
                    // delete payload and metadata files
                    if (transformByQState.getPayloadFilePath()) {
                        fs.rmSync(transformByQState.getPayloadFilePath(), { force: true })
                    }
                    fs.rmSync(path.join(transformByQState.getJobHistoryPath(), 'metadata.txt'), { force: true })
                    // delete temporary build logs file
                    const logFilePath = path.join(os.tmpdir(), 'build-logs.txt')
                    if (fs.existsSync(logFilePath)) {
                        fs.rmSync(logFilePath, { force: true })
                    }
                }
            } catch (e: any) {
                getLogger().error('Code Transformation: Error resuming job (id: %s): %s', jobId, (e as Error).message)
                transformByQState.setJobDefaults()
                if (messenger) {
                    messenger.sendJobFinishedMessage(
                        ChatSessionManager.Instance.getSession().tabID!,
                        "Sorry, I couldn't refresh the job. Please try again or start a new transformation."
                    )
                }
                void vscode.window.showErrorMessage(`There was an error refreshing this job. Job Id: ${jobId}`)
                this.updateContent('job history') // re-enable refresh buttons
                return
            }

            // reset state
            transformByQState.setJobDefaults()
            if (messenger) {
                messenger.sendJobFinishedMessage(
                    ChatSessionManager.Instance.getSession().tabID!,
                    'Job refresh completed. Please see the transformation history table for the updated status and artifacts.'
                )
            }
        } else {
            // FAILED or STOPPED job
            getLogger().info('Code Transformation: No artifacts available to download (job status = %s)', status)
            if (status === 'FAILED') {
                // if job failed on backend, mark it to disable the refresh button
                status = 'FAILED_BE' // this will be truncated to just 'FAILED' in the table
            }
        }

        if (status === currentStatus && !jobHistoryPath) {
            // no changes, no need to update file/table
            void vscode.window.showInformationMessage(`No updates. (Job Id: ${jobId})`)
            return
        }

        void vscode.window.showInformationMessage(`Job refresh completed. (Job Id: ${jobId})`)
        // update local file and history table
        await this.updateHistoryFile(status, duration, jobHistoryPath, jobId)
    }

    private async retrieveArtifacts(jobId: string, projectName: string) {
        const resultsPath = path.join(os.homedir(), '.aws', 'transform', projectName, 'results') // temporary directory for extraction
        let jobHistoryPath = path.join(os.homedir(), '.aws', 'transform', projectName, jobId)

        if (fs.existsSync(path.join(jobHistoryPath, 'diff.patch'))) {
            getLogger().info('Code Transformation: Diff patch already exists for job id: %s', jobId)
            jobHistoryPath = ''
        } else {
            try {
                await downloadAndExtractResultArchive(jobId, resultsPath)

                if (!fs.existsSync(path.join(jobHistoryPath, 'summary'))) {
                    fs.mkdirSync(path.join(jobHistoryPath, 'summary'), { recursive: true })
                }
                fs.copyFileSync(path.join(resultsPath, 'patch', 'diff.patch'), path.join(jobHistoryPath, 'diff.patch'))
                fs.copyFileSync(
                    path.join(resultsPath, 'summary', 'summary.md'),
                    path.join(jobHistoryPath, 'summary', 'summary.md')
                )
                fs.copyFileSync(
                    path.join(resultsPath, 'summary', 'buildCommandOutput.log'),
                    path.join(jobHistoryPath, 'summary', 'buildCommandOutput.log')
                )
            } catch (error) {
                jobHistoryPath = ''
            } finally {
                if (fs.existsSync(resultsPath)) {
                    fs.rmSync(resultsPath, { recursive: true, force: true })
                }
                getLogger().info('Code Transformation: Deleted temporary extraction directory')
            }
        }
        return jobHistoryPath
    }

    private async updateHistoryFile(status: string, duration: string, jobHistoryPath: string, jobId: string) {
        const history: string[][] = []
        const historyLogFilePath = path.join(os.homedir(), '.aws', 'transform', 'transformation-history.tsv')
        if (fs.existsSync(historyLogFilePath)) {
            const historyFile = fs.readFileSync(historyLogFilePath, { encoding: 'utf8', flag: 'r' })
            const jobs = historyFile.split('\n')
            jobs.shift() // removes headers
            if (jobs.length > 0) {
                jobs.forEach((job) => {
                    if (job) {
                        const jobInfo = job.split('\t')
                        // startTime: jobInfo[0], projectName: jobInfo[1], status: jobInfo[2], duration: jobInfo[3], diffPath: jobInfo[4], summaryPath: jobInfo[5], jobId: jobInfo[6]
                        if (jobInfo[6] === jobId) {
                            // update any values if applicable
                            jobInfo[2] = status
                            if (duration) {
                                jobInfo[3] = duration
                            }
                            if (jobHistoryPath) {
                                jobInfo[4] = path.join(jobHistoryPath, 'diff.patch')
                                jobInfo[5] = path.join(jobHistoryPath, 'summary', 'summary.md')
                            }
                        }
                        history.push(jobInfo)
                    }
                })
            }
        }
        if (history.length > 0) {
            // rewrite file
            fs.writeFileSync(historyLogFilePath, 'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n')
            const tsvContent = history.map((row) => row.join('\t')).join('\n') + '\n'
            fs.writeFileSync(historyLogFilePath, tsvContent, { flag: 'a' })

            // update table content
            await this.updateContent('job history', undefined, true)
        }
    }

    private generateTransformationStepMarkup(
        name: string,
        startTime: Date | undefined,
        endTime: Date | undefined,
        previousStatus: string,
        isFirstStep: boolean,
        isLastStep: boolean,
        stepProgress: StepProgress,
        stepId: number,
        isCurrentlyProcessing: boolean
    ) {
        // include check for the previous step not being CREATED, as this means it has finished, so we can display the next step
        if (startTime && endTime && (isFirstStep || previousStatus !== 'CREATED')) {
            const stepTime = endTime.toLocaleDateString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            })
            const stepDuration = convertToTimeString(endTime.getTime() - startTime.getTime())
            const isAllStepsComplete = isLastStep && (stepProgress === StepProgress.Succeeded || StepProgress.Failed)
            return `
                <p class="step ${isAllStepsComplete ? 'active' : ''}" id="step-${stepId}">
                    ${this.getProgressIconMarkup(stepProgress)} ${name} 
                    <span id="step-duration">[finished on ${stepTime}] ${stepDuration}</span>
                </p>`
        } else if (previousStatus !== 'CREATED' && isCurrentlyProcessing) {
            return `
                <p class="step active" id="step-${stepId}")>
                    ${this.getProgressIconMarkup(stepProgress)} ${name}
                </p>`
        } else if (previousStatus !== 'CREATED') {
            return `
                <p class="step" id="step-${stepId}")>
                    ${this.getProgressIconMarkup(stepProgress)} ${name}
                </p>`
        }
    }

    private stepStatusToStepProgress(stepStatus: string, transformFailed: boolean) {
        if (stepStatus === 'COMPLETED' || stepStatus === 'PARTIALLY_COMPLETED') {
            return StepProgress.Succeeded
        } else if (stepStatus === 'STOPPED' || stepStatus === 'FAILED' || transformFailed) {
            return StepProgress.Failed
        } else {
            return StepProgress.Pending
        }
    }

    private selectSubstepIcon(status: string) {
        switch (status) {
            case 'IN_PROGRESS':
                // In case transform is cancelled by user, the state transitions to not started after some time.
                // This may contradict the last result from the API, so need to be handled here.
                if (transformByQState.isNotStarted()) {
                    return '<p><span class="status-FAILED"> 𐔧 </span></p>'
                }
                return '<p><span class="spinner status-PENDING"> ↻ </span></p>'
            case 'COMPLETED':
                return '<p><span class="status-COMPLETED"> ✓ </span></p>'
            case 'AWAITING_CLIENT_ACTION':
                return '<p><span class="spinner status-PENDING"> ↻ </span></p>'
            case 'FAILED':
            default:
                return '<p><span class="status-FAILED"> 𐔧 </span></p>'
        }
    }

    private generateSubstepMarkup(progressUpdates: ProgressUpdates, stepId: number, stepTitle: string) {
        const substepParagraphs = []
        for (const subStep of progressUpdates) {
            substepParagraphs.push(`
            <div class="substep-container">
                <div class="substep-icon">${this.selectSubstepIcon(subStep.status)}</div>
                <div>
                    <p>${subStep.name}</p>
                    ${subStep.description ? `<p class="status-${subStep.status}"> ${subStep.description}</p>` : ''}
                </div>
            </div>
            `)
        }
        return `<div class="substep" id="substep-${stepId}">
        <p><b>${stepTitle}</b></p>
        ${substepParagraphs.join('\n')}
        </div>`
    }

    /**
     * Generates markup for each step in a transformation plan
     * @param planSteps The transformation steps of the transformation plan
     * @param isTransformFailed boolean of if the transform failed during the transformation step
     * @returns Tuple where first element is the markup for the steps and the second element is the markup of all substeps
     */
    private getTransformationStepProgressMarkup(
        planSteps: TransformationSteps | undefined,
        isTransformFailed: boolean
    ) {
        const steps = []
        const substeps = []
        if (planSteps !== undefined) {
            const stepStatuses = []
            for (const step of planSteps) {
                stepStatuses.push(step.status)
            }
            let lastPendingStep = undefined
            for (let i = 0; i < planSteps.length; i++) {
                const step = planSteps[i]
                const stepProgress = this.stepStatusToStepProgress(step.status, isTransformFailed)
                lastPendingStep =
                    lastPendingStep === undefined && stepProgress === StepProgress.Pending ? i : lastPendingStep
                const stepMarkup = this.generateTransformationStepMarkup(
                    step.name,
                    step.startTime,
                    step.endTime,
                    stepStatuses[i - 1],
                    i === 0,
                    i === planSteps.length - 1,
                    stepProgress,
                    i,
                    lastPendingStep === i
                )
                steps.push(stepMarkup)
                if (step.progressUpdates) {
                    substeps.push(this.generateSubstepMarkup(step.progressUpdates, i, step.name))
                }
            }
        }

        return [steps.join(''), substeps.join('\n')]
    }

    private getLatestGenericStepDetails(currentJobStatus: TransformationStatus) {
        switch (currentJobStatus) {
            case 'CREATED':
            case 'ACCEPTED':
            case 'STARTED':
                return CodeWhispererConstants.filesUploadedMessage
            case 'PREPARING':
            case 'PREPARED':
                // for SQL conversions, skip to transformingMessage since we don't build the code
                return transformByQState.getTransformationType() === TransformationType.SQL_CONVERSION
                    ? CodeWhispererConstants.transformingMessage
                    : CodeWhispererConstants.buildingCodeMessage.replace(
                          'JAVA_VERSION_HERE',
                          transformByQState.getSourceJDKVersion() ?? ''
                      )
            case 'PLANNING':
            case 'PLANNED':
                // for SQL conversions, skip to transformingMessage since we don't generate a plan
                return transformByQState.getTransformationType() === TransformationType.SQL_CONVERSION
                    ? CodeWhispererConstants.transformingMessage
                    : CodeWhispererConstants.planningMessage
            case 'TRANSFORMING':
            case 'TRANSFORMED':
            case 'COMPLETED':
            case 'PARTIALLY_COMPLETED':
                return CodeWhispererConstants.transformingMessage
            case 'STOPPING':
            case 'STOPPED':
                return CodeWhispererConstants.stoppingJobMessage
            case 'FAILED':
            case 'REJECTED':
                return CodeWhispererConstants.failedStepMessage
            default:
                if (transformByQState.isCancelled()) {
                    return CodeWhispererConstants.stoppingJobMessage
                } else if (transformByQState.isFailed()) {
                    return CodeWhispererConstants.failedStepMessage
                } else if (transformByQState.isRunning()) {
                    return CodeWhispererConstants.scanningProjectMessage
                } else if (transformByQState.isPartiallySucceeded() || transformByQState.isSucceeded()) {
                    return CodeWhispererConstants.jobCompletedMessage // this should never have to be shown since substeps will block the generic details, added for completeness
                } else {
                    return CodeWhispererConstants.noOngoingJobMessage
                }
        }
    }

    public async showPlanProgress(startTime: number): Promise<string> {
        const styleSheet = this._view?.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'css', 'amazonqTransformationHub.css')
        )
        const simpleStep = (icon: string, text: string, isActive: boolean) => {
            return isActive
                ? `<p class="simple-step active">${icon} ${text}</p>`
                : `<p class="simple-step">${icon} ${text}</p>`
        }

        let planSteps = transformByQState.getPlanSteps()
        // no plan for SQL conversions
        if (
            transformByQState.getTransformationType() !== TransformationType.SQL_CONVERSION &&
            jobPlanProgress['generatePlan'] === StepProgress.Succeeded &&
            transformByQState.isRunning()
        ) {
            try {
                planSteps = await getTransformationSteps(
                    transformByQState.getJobId(),
                    AuthUtil.instance.regionProfileManager.activeRegionProfile
                )
                transformByQState.setPlanSteps(planSteps)
            } catch (e: any) {
                // no-op; re-use current plan steps and try again in next polling cycle
                getLogger().error(
                    `CodeTransformation: failed to get plan steps to show updates in transformation hub, continuing transformation; error = %O`,
                    e
                )
            }
        }
        let progressHtml
        // for each step that has succeeded, increment activeStepId by 1
        let activeStepId = [
            jobPlanProgress.uploadCode,
            jobPlanProgress.buildCode,
            jobPlanProgress.generatePlan,
            jobPlanProgress.transformCode,
        ]
            .map((it) => (it === StepProgress.Succeeded ? 1 : 0) as number)
            .reduce((prev, current) => prev + current)
        // When we receive plan step details, we want those to be active -> increment activeStepId
        activeStepId += planSteps === undefined || planSteps.length === 0 ? 0 : 1

        if (jobPlanProgress['transformCode'] !== StepProgress.NotStarted) {
            const waitingMarkup = simpleStep(
                this.getProgressIconMarkup(jobPlanProgress['uploadCode']),
                CodeWhispererConstants.uploadingCodeStepMessage,
                activeStepId === 0
            )
            const buildMarkup =
                activeStepId >= 1 && transformByQState.getTransformationType() !== TransformationType.SQL_CONVERSION // for SQL conversions, don't show buildCode step
                    ? simpleStep(
                          this.getProgressIconMarkup(jobPlanProgress['buildCode']),
                          CodeWhispererConstants.buildCodeStepMessage,
                          activeStepId === 1
                      )
                    : ''
            const planMarkup =
                activeStepId >= 2 && transformByQState.getTransformationType() !== TransformationType.SQL_CONVERSION // for SQL conversions, don't show generatePlan step
                    ? simpleStep(
                          this.getProgressIconMarkup(jobPlanProgress['generatePlan']),
                          CodeWhispererConstants.generatePlanStepMessage,
                          activeStepId === 2
                      )
                    : ''
            const transformMarkup =
                activeStepId >= 3
                    ? simpleStep(
                          this.getProgressIconMarkup(jobPlanProgress['transformCode']),
                          CodeWhispererConstants.transformStepMessage,
                          activeStepId === 3
                      )
                    : ''

            const isTransformFailed = jobPlanProgress['transformCode'] === StepProgress.Failed
            const progress = this.getTransformationStepProgressMarkup(planSteps, isTransformFailed)
            const latestGenericStepDetails = this.getLatestGenericStepDetails(transformByQState.getPolledJobStatus())
            const jobId = transformByQState.getJobId()
            progressHtml = `
            <div id="progress" class="column">
                <p><b>Transformation Progress</b> <span id="runningTime"></span></p>
                <p>${jobId ? `Job ID: ${jobId}` : ''}</p>
                ${waitingMarkup}
                ${buildMarkup}
                ${planMarkup}
                ${transformMarkup}
                ${progress[0]}
            </div>
            <div id="stepdetails" class="column">
                <div class="substep center ${
                    transformByQState.isNotStarted() ? 'blocked' : ''
                }" id="generic-step-details">
                    <div class="column--container">
                        <div class="center-flex substep-icon"><p class="center-flex"><span class="spinner status-PENDING"> ↻ </span></p></div>
                        <div><p>${latestGenericStepDetails}</p></div>
                    </div>
                </div>
                ${progress[1]}
            </div>
            `
        } else {
            progressHtml = `
            <div id="progress" class="column">
                <p><b>Transformation Progress</b></p>
                <p>No job ongoing</p>
            </div>`
        }
        return `<!DOCTYPE html>
            <html lang="en">
            
            <head>
                <title>Transformation Hub</title>
                <link href="${styleSheet}" rel="stylesheet">
            </head>
            <body>
            <div class="wrapper">
                <div style="flex:1; overflow: auto;">
                    <div class="column--container">
                        ${progressHtml}
                    </div>
                </div>
            </div>
            <script>
                let intervalId = undefined;
                let runningTime = "";

                function updateTimer() {
                    if (${transformByQState.isRunning()}) {
                        runningTime = convertToTimeString(Date.now() - ${startTime});
                        document.getElementById("runningTime").textContent = "Time elapsed: " + runningTime;
                    } else {
                        clearInterval(intervalId);
                    }
                }

                // copied from textUtilities.ts
                function convertToTimeString(durationInMs) {
                    const time = new Date(durationInMs);
                    const hours = time.getUTCHours();
                    const minutes = time.getUTCMinutes();
                    const seconds = time.getUTCSeconds();
                    let timeString = seconds + " sec"
                    if (minutes > 0) {
                        timeString = minutes + " min " + timeString
                    }
                    if (hours > 0) {
                        timeString = hours + " hr " + timeString
                    }
                    return timeString
                }

                function clearActiveSteps(){
                    const activeSteps = document.querySelectorAll(".active")
                    for(const step of activeSteps){
                        step.classList.remove("active")
                    }
                }

                function showStepDetails(item) {
                    const visibleSubSteps = document.querySelectorAll(".visible");
                    const substep = document.getElementById(item.id.replace("step-", "substep-"))
                    clearActiveSteps()
                    for(const visibleSubStep of visibleSubSteps){                
                        visibleSubStep.classList.remove("visible")
                        document.getElementById(visibleSubStep.id.replace("substep-", "step-")).classList.remove("active")
                    }
                    
                    substep.classList.add("visible")
                    item.classList.add("active")
                    document.getElementById("generic-step-details").classList.add("blocked")
                }

                function handleSimpleStepClicked(item) {  
                    clearActiveSteps()
                    item.classList.add("active")
                    if(document.getElementById("generic-step-details").classList.contains("blocked")){
                        return
                    }
                    document.getElementById("generic-step-details").classList.add("visible")
                }


                function addShowSubstepEventListeners() {
                    const steps = document.getElementsByClassName("step");
                    for(const item of steps) {
                        item.addEventListener("click", (event) => {
                            showStepDetails(item)
                        })
                    }
                }

                function addHighlightStepWithoutSubstepListeners() {
                    const steps = document.getElementsByClassName("simple-step");
                    for(const item of steps) {
                        item.addEventListener("click", (event) => {
                            handleSimpleStepClicked(item)
                        })
                    }
                }

                function showCurrentActiveSubstep() {
                    const activeStep = document.getElementsByClassName("active")[0]
                    if(activeStep && activeStep.classList.contains("step")){
                        showStepDetails(activeStep)
                    } else if(activeStep && activeStep.classList.contains("simple-step")){
                        handleSimpleStepClicked(activeStep)
                    }
                }

                intervalId = setInterval(updateTimer, 1000);
                addShowSubstepEventListeners();
                addHighlightStepWithoutSubstepListeners();
                showCurrentActiveSubstep();
                updateTimer()
            </script>
            </body>
            </html>`
    }

    private getProgressIconMarkup(stepStatus: StepProgress) {
        if (stepStatus === StepProgress.Succeeded) {
            return `<span class="status-COMPLETED"> ✓ </span>`
        } else if (stepStatus === StepProgress.Pending) {
            return `<span class="spinner status-PENDING"> ↻ </span>`
        } else {
            return `<span class="status-PENDING"> ✓ </span>`
        }
    }
}

export function readHistoryFile(): HistoryObject[] {
    const history: HistoryObject[] = []
    const jobHistoryFilePath = path.join(os.homedir(), '.aws', 'transform', 'transformation-history.tsv')
    if (fs.existsSync(jobHistoryFilePath)) {
        const historyFile = fs.readFileSync(jobHistoryFilePath, { encoding: 'utf8', flag: 'r' })
        const jobs = historyFile.split('\n')
        jobs.shift() // removes headers

        // Process from end, stop at 10 valid entries
        for (let i = jobs.length - 1; i >= 0 && history.length < 10; i--) {
            const job = jobs[i]
            if (job && isWithin30Days(job.split('\t')[0])) {
                const jobInfo = job.split('\t')
                history.push({
                    startTime: jobInfo[0],
                    projectName: jobInfo[1],
                    status: jobInfo[2],
                    duration: jobInfo[3],
                    diffPath: jobInfo[4],
                    summaryPath: jobInfo[5],
                    jobId: jobInfo[6],
                })
            }
        }
    }
    return history
}
