/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import * as CodeWhispererConstants from '../../models/constants'
import { StepProgress, jobPlanProgress, sessionJobHistory, transformByQState } from '../../models/model'
import { convertToTimeString } from '../../../shared/utilities/textUtilities'
import { getLogger } from '../../../shared/logger'
import { getTransformationSteps } from './transformApiHandler'
import {
    TransformationSteps,
    ProgressUpdates,
    TransformationStatus,
} from '../../../codewhisperer/client/codewhispereruserclient'
import { startInterval } from '../../commands/startTransformByQ'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'

export class TransformationHubViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aws.amazonq.transformationHub'
    private _view?: vscode.WebviewView
    private lastClickedButton: string = ''
    private _extensionUri: vscode.Uri = globals.context.extensionUri
    constructor() {}
    static #instance: TransformationHubViewProvider

    public async updateContent(
        button: 'job history' | 'plan progress',
        startTime: number = CodeTransformTelemetryState.instance.getStartTime()
    ) {
        this.lastClickedButton = button
        if (this._view) {
            if (this.lastClickedButton === 'job history') {
                clearInterval(transformByQState.getIntervalId())
                transformByQState.setIntervalId(undefined)
                this._view!.webview.html = this.showJobHistory()
            } else {
                if (transformByQState.getIntervalId() === undefined && transformByQState.isRunning()) {
                    await startInterval()
                }
                await this.showPlanProgress(startTime)
                    .then(jobPlanProgress => {
                        this._view!.webview.html = jobPlanProgress
                    })
                    .catch(e => {
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

        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        }

        if (this.lastClickedButton === 'job history') {
            this._view!.webview.html = this.showJobHistory()
        } else {
            this.showPlanProgress(Date.now())
                .then(jobPlanProgress => {
                    this._view!.webview.html = jobPlanProgress
                })
                .catch(e => {
                    getLogger().error('showPlanProgress failed: %s', (e as Error).message)
                })
        }
    }

    private showJobHistory(): string {
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
            <p><b>Job Status</b></p>
            ${
                Object.keys(sessionJobHistory).length === 0
                    ? `<p>${CodeWhispererConstants.nothingToShowMessage}</p>`
                    : this.getTableMarkup(sessionJobHistory[transformByQState.getJobId()])
            }
            </body>
            </html>`
    }

    private getTableMarkup(job: { startTime: string; projectName: string; status: string; duration: string }) {
        return `
            <table border="1" style="border-collapse:collapse">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Project</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Id</th>
                    </tr>
                </thead>
                <tbody>
                <tr>
                    <td>${job.startTime}</td>
                    <td>${job.projectName}</td>
                    <td>${job.status}</td>
                    <td>${job.duration}</td>
                    <td>${transformByQState.getJobId()}</td>
                </tr>
                </tbody>
            </table>
        `
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
                return CodeWhispererConstants.buildingCodeMessage.replace(
                    'JAVA_VERSION_HERE',
                    transformByQState.getSourceJDKVersion() ?? ''
                )
            case 'PLANNING':
            case 'PLANNED':
                return CodeWhispererConstants.planningMessage
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
        if (jobPlanProgress['generatePlan'] === StepProgress.Succeeded && transformByQState.isRunning()) {
            planSteps = await getTransformationSteps(transformByQState.getJobId())
            transformByQState.setPlanSteps(planSteps)
        }
        let progressHtml
        // for each step that has succeeded, increment activeStepId by 1
        let activeStepId = [
            jobPlanProgress.startJob,
            jobPlanProgress.buildCode,
            jobPlanProgress.generatePlan,
            jobPlanProgress.transformCode,
        ]
            .map(it => (it === StepProgress.Succeeded ? 1 : 0) as number)
            .reduce((prev, current) => prev + current)
        // When we receive plan step details, we want those to be active -> increment activeStepId
        activeStepId += planSteps === undefined || planSteps.length === 0 ? 0 : 1

        if (jobPlanProgress['transformCode'] !== StepProgress.NotStarted) {
            const waitingMarkup = simpleStep(
                this.getProgressIconMarkup(jobPlanProgress['startJob']),
                CodeWhispererConstants.waitingForJobStartStepMessage,
                activeStepId === 0
            )
            const buildMarkup =
                activeStepId >= 1
                    ? simpleStep(
                          this.getProgressIconMarkup(jobPlanProgress['buildCode']),
                          CodeWhispererConstants.buildCodeStepMessage,
                          activeStepId === 1
                      )
                    : ''
            const planMarkup =
                activeStepId >= 2
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
            progressHtml = `
            <div id="progress" class="column">
                <p><b>Transformation Progress</b> <span id="runningTime"></span></p>
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
