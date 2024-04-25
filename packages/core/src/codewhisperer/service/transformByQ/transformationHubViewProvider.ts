/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { getJobHistory, getPlanProgress } from '../../commands/startTransformByQ'
import { StepProgress, transformByQState } from '../../models/model'
import { convertToTimeString } from '../../../shared/utilities/textUtilities'
import { getLogger } from '../../../shared/logger'
import { getTransformationSteps } from './transformApiHandler'
import {
    TransformationSteps,
    ProgressUpdates,
    TransformationStatus,
} from '../../../codewhisperer/client/codewhispereruserclient'

export class TransformationHubViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aws.amazonq.transformationHub'
    private _view?: vscode.WebviewView
    private lastClickedButton: string = ''
    private _extensionUri: vscode.Uri = globals.context.extensionUri
    constructor() {}
    static #instance: TransformationHubViewProvider

    public updateContent(button: 'job history' | 'plan progress', startTime: number) {
        this.lastClickedButton = button
        if (this._view) {
            if (this.lastClickedButton === 'job history') {
                this._view!.webview.html = this.showJobHistory()
            } else {
                this.showPlanProgress(startTime)
                    .then(planProgress => {
                        this._view!.webview.html = planProgress
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
                .then(planProgress => {
                    this._view!.webview.html = planProgress
                })
                .catch(e => {
                    getLogger().error('showPlanProgress failed: %s', (e as Error).message)
                })
        }
    }

    private showJobHistory(): string {
        const history = getJobHistory()
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
            ${history.length === 0 ? '<p>Nothing to show</p>' : this.getTableMarkup(history)}
            </body>
            </html>`
    }

    private getTableMarkup(
        history: { timestamp: string; module: string; status: string; duration: string; id: string }[]
    ) {
        return `
            <table border="1" style="border-collapse:collapse">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Module</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Id</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(
                        job => `<tr>
                        <td>${job.timestamp}</td>
                        <td>${job.module}</td>
                        <td>${job.status}</td>
                        <td>${job.duration}</td>
                        <td>${job.id}</td>
                    </tr>`
                    )}
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
            const isAllStepsComplete = isLastStep && stepProgress === StepProgress.Succeeded
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
                return 'Files have been uploaded to Amazon Q, transformation job has been accepted and is preparing to start.'
            case 'PREPARING':
            case 'PREPARED':
                return `Amazon Q is building your code using Java ${transformByQState.getSourceJDKVersion()} in a secure build environment.`
            case 'PLANNING':
            case 'PLANNED':
                return 'Amazon Q is analyzing your code in order to generate a transformation plan.'
            case 'TRANSFORMING':
            case 'TRANSFORMED':
            case 'COMPLETED':
            case 'PARTIALLY_COMPLETED':
                return 'Amazon Q is transforming your code. Details will appear soon.'
            case 'STOPPING':
            case 'STOPPED':
                return 'Stopping the job...'
            case 'FAILED':
            case 'REJECTED':
                return 'The step failed, fetching additional details...'
            default:
                if (transformByQState.isCancelled()) {
                    return 'Stopping the job...'
                } else if (transformByQState.isFailed()) {
                    return 'The step failed, fetching additional details...'
                } else if (transformByQState.isRunning()) {
                    return `Amazon Q is scanning the project files and getting ready to start the job. 
                    To start the job, Amazon Q needs to upload the project artifacts. Once that's done, Q can start the transformation job. 
                    The estimated time for this operation ranges from a few seconds to several minutes.`
                } else if (transformByQState.isPartiallySucceeded() || transformByQState.isSucceeded()) {
                    return 'Job completed' // this should never have too be shown since substeps will block the generic details. Added for completeness.
                } else {
                    return 'No ongoing job.'
                }
        }
    }

    public async showPlanProgress(startTime: number): Promise<string> {
        const planProgress = getPlanProgress()
        const simpleStep = (icon: string, text: string, isActive: boolean) => {
            return isActive
                ? `<p class="simple-step active">${icon} ${text}</p>`
                : `<p class="simple-step">${icon} ${text}</p>`
        }

        let planSteps = transformByQState.getPlanSteps()
        if (planProgress['generatePlan'] === StepProgress.Succeeded && transformByQState.isRunning()) {
            planSteps = await getTransformationSteps(transformByQState.getJobId())
            transformByQState.setPlanSteps(planSteps)
        }
        let progressHtml
        // for each step that has succeeded, increment activeStepId by 1
        let activeStepId = [
            planProgress.startJob,
            planProgress.buildCode,
            planProgress.generatePlan,
            planProgress.transformCode,
        ]
            .map(it => (it === StepProgress.Succeeded ? 1 : 0) as number)
            .reduce((prev, current) => prev + current)
        // When we receive plan step details, we want those to be active -> increment activeStepId
        activeStepId += planSteps === undefined || planSteps.length === 0 ? 0 : 1

        if (planProgress['transformCode'] !== StepProgress.NotStarted) {
            const waitingMarkup = simpleStep(
                this.getProgressIconMarkup(planProgress['startJob']),
                'Waiting for job to start',
                activeStepId === 0
            )
            const buildMarkup =
                activeStepId >= 1
                    ? simpleStep(
                          this.getProgressIconMarkup(planProgress['buildCode']),
                          'Build uploaded code in secure build environment',
                          activeStepId === 1
                      )
                    : ''
            const planMarkup =
                activeStepId >= 2
                    ? simpleStep(
                          this.getProgressIconMarkup(planProgress['generatePlan']),
                          'Generate transformation plan',
                          activeStepId === 2
                      )
                    : ''
            const transformMarkup =
                activeStepId >= 3
                    ? simpleStep(
                          this.getProgressIconMarkup(planProgress['transformCode']),
                          'Transform your code to Java 17 using transformation plan',
                          activeStepId === 3
                      )
                    : ''

            const isTransformFailed = planProgress['transformCode'] === StepProgress.Failed
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
            <style>
                @keyframes spin {
                    0% {
                        transform: rotate(0deg);
                    }
                    100% {
                        transform: rotate(360deg);
                    }
                }
                body {
                    margin: 0;
                    padding: 0 1em;
                    height: 100vh;
                }

                .wrapper {
                    height: 100%;
                    display: flex;
                }

                .spinner {
                    display: inline-block;
                    animation: spin 1s infinite;
                }

                .column--container, .substep-container {
                    display: flex;
                    flex-direction: row;
                }

                .column {
                    flex-grow: 1;
                }

                .substep-container  p {
                    margin: .5em 0;
                }

                .step, .simple-step {
                    padding: .5em 0 .5em 0;
                    margin: 0;
                }

                .step {
                    padding-left: 20px;
                }

                .step:hover, .active {
                    background-color: aliceblue;
                    background-color: var(button.hoverBackground);
                }

                #stepdetails {
                    width: 40%;
                    padding: 0 20px;
                    border-left: solid rgba(229,229,229, .5);
                    min-height: 100vh;
                    display: block;
                }

                #progress {
                    width: 60%;
                }

                .status-PENDING {
                    color: grey;
                }

                .status-COMPLETED {
                    color: green;
                }

                .status-FAILED {
                    color: red;
                }

                .substep {
                    display: none;
                }

                .substep-icon {
                    padding: 0 1em;
                }

                .visible {
                    display: block;
                }

                .center {
                    position: absolute;
                    top: 50%;
                    transform: translate(0, -50%);
                }

                .center-flex {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                #step-duration {
                    color: rgba(59, 59, 59, .75);
                }
            </style>
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
