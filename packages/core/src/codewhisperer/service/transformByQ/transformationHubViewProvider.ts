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

    private async showPlanProgress(startTime: number): Promise<string> {
        const planProgress = getPlanProgress()
        let planSteps = undefined
        if (planProgress['generatePlan'] === StepProgress.Succeeded) {
            planSteps = await getTransformationSteps(transformByQState.getJobId())
        }
        let progressHtml = `<p><b>Transformation Status</b></p><p>No job ongoing</p>`
        if (planProgress['transformCode'] !== StepProgress.NotStarted) {
            progressHtml = `<p><b>Transformation Status</b></p>`
            progressHtml += `<p> ${this.getProgressIconMarkup(planProgress['startJob'])} Waiting for job to start</p>`
            if (planProgress['startJob'] === StepProgress.Succeeded) {
                progressHtml += `<p> ${this.getProgressIconMarkup(
                    planProgress['buildCode']
                )} Build uploaded code in secure build environment</p>`
            }
            if (planProgress['buildCode'] === StepProgress.Succeeded) {
                progressHtml += `<p> ${this.getProgressIconMarkup(
                    planProgress['generatePlan']
                )} Generate transformation plan</p>`
            }
            if (planProgress['generatePlan'] === StepProgress.Succeeded) {
                progressHtml += `<p> ${this.getProgressIconMarkup(
                    planProgress['transformCode']
                )} Transform your code to Java 17 using transformation plan</p>`
                // now get the details of each sub-step of the "transformCode" step
                if (planSteps !== undefined) {
                    const stepStatuses = []
                    for (const step of planSteps) {
                        stepStatuses.push(step.status)
                    }
                    for (let i = 0; i < planSteps.length; i++) {
                        const step = planSteps[i]
                        const stepStatus = step.status
                        let stepProgress = undefined
                        if (stepStatus === 'COMPLETED' || stepStatus === 'PARTIALLY_COMPLETED') {
                            stepProgress = StepProgress.Succeeded
                        } else if (
                            stepStatus === 'STOPPED' ||
                            stepStatus === 'FAILED' ||
                            planProgress['transformCode'] === StepProgress.Failed
                        ) {
                            stepProgress = StepProgress.Failed
                        } else {
                            stepProgress = StepProgress.Pending
                        }
                        // include check for the previous step not being CREATED, as this means it has finished, so we can display the next step
                        if (step.startTime && step.endTime && (i === 0 || stepStatuses[i - 1] !== 'CREATED')) {
                            const stepTime = step.endTime.toLocaleDateString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                            })
                            const stepDuration = convertToTimeString(step.endTime.getTime() - step.startTime.getTime())
                            progressHtml += `<p style="margin-left: 20px">${this.getProgressIconMarkup(stepProgress)} ${
                                step.name
                            } [finished on ${stepTime}] <span style="color:grey">${stepDuration}</span></p>`
                        } else if (stepStatuses[i - 1] !== 'CREATED') {
                            progressHtml += `<p style="margin-left: 20px">${this.getProgressIconMarkup(stepProgress)} ${
                                step.name
                            }</p>`
                        }
                        if (step.progressUpdates) {
                            for (const subStep of step.progressUpdates) {
                                progressHtml += `<p style="margin-left: 40px">- ${subStep.name}</p>`
                                if (subStep.description) {
                                    progressHtml += `<p style="margin-left: 60px; color:${this.getFontColorForSubStep(
                                        subStep.status
                                    )}">- ${subStep.description}</p>`
                                }
                            }
                        }
                    }
                }
            }
        }
        const isJobInProgress = transformByQState.isRunning()
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
                .spinner {
                    display: inline-block;
                    animation: spin 1s infinite;
                }
            </style>
            </head>
            <body>
            <div style="display: flex">
                <div style="flex:1; overflow: auto;">
                    <div id="runningTime" style="flex:1; overflow: auto;"></div>
                    ${progressHtml}
                </div>
            </div>
            <script>
                let intervalId = undefined;
                let runningTime = "";

                function updateTimer() {
                    if (${isJobInProgress}) {
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
                intervalId = setInterval(updateTimer, 1000);
            </script>
            </body>
            </html>`
    }

    private getProgressIconMarkup(stepStatus: StepProgress) {
        if (stepStatus === StepProgress.Succeeded) {
            return `<span style="color: green"> ✓ </span>`
        } else if (stepStatus === StepProgress.Pending) {
            return `<span style="color: grey" class="spinner"> ↻ </span>`
        } else {
            return `<span style="color: grey"> ✓ </span>`
        }
    }

    private getFontColorForSubStep(status: string) {
        if (status === 'COMPLETED') {
            return 'green'
        } else if (status === 'FAILED') {
            return 'red'
        } else {
            return '' // uses VS Code's default color
        }
    }
}
