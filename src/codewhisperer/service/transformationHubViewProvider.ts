/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { getJobHistory, getPlanProgress } from '../commands/startTransformByQ'
import { StepProgress } from '../models/model'

export class TransformationHubViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aws.codeWhisperer.transformationHub'
    private _view?: vscode.WebviewView
    private lastClickedButton: string = ''
    private _extensionUri: vscode.Uri = globals.context.extensionUri
    constructor() {}
    static #instance: TransformationHubViewProvider

    public updateContent(button: 'job history' | 'plan progress') {
        this.lastClickedButton = button
        if (this._view) {
            this._view.webview.html =
                this.lastClickedButton === 'job history' ? this.showJobHistory() : this.showPlanProgress()
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
        this._view!.webview.html =
            this.lastClickedButton === 'plan progress' ? this.showPlanProgress() : this.showJobHistory()
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
            <p><b>Last Run</b></p>
            ${history.length === 0 ? '<p>No job to display</p>' : this.getTableMarkup(history)}
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

    private showPlanProgress(): string {
        const progress = getPlanProgress()
        let progressHtml = `<p><b>Plan Progress</b></p><p>No job is in-progress at the moment</p>`
        if (progress['returnCode'] !== StepProgress.NotStarted) {
            progressHtml = `<p><b>Plan Progress</b></p>`
            progressHtml += `<p> ${this.getProgressIconMarkup(
                progress['uploadCode']
            )} Uploading code to dedicated environment</p>`
            if (progress['uploadCode'] === StepProgress.Succeeded) {
                progressHtml += `<p> ${this.getProgressIconMarkup(
                    progress['buildCode']
                )} Building code and generating transformation plan</p>`
            }
            if (progress['buildCode'] === StepProgress.Succeeded) {
                progressHtml += `<p> ${this.getProgressIconMarkup(
                    progress['transformCode']
                )} Stepping through transformation plan</p>`
            }
            if (progress['transformCode'] === StepProgress.Succeeded) {
                progressHtml += `<p> ${this.getProgressIconMarkup(
                    progress['returnCode']
                )} Validating changes and returning code</p>`
            }
        }
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
            <title>Transformation Hub</title>
            <script src="https://kit.fontawesome.com/f865aad943.js" crossorigin="anonymous"></script>
            </head>
            <body>
            <div style="display: flex">
                <div style="flex:1; overflow: auto;">
                ${progressHtml}
                </div>
                <div style="flex:1; overflow: auto;">
                </div>
            </div>
            </body>
            </html>`
    }

    private getProgressIconMarkup(stepStatus: StepProgress) {
        if (stepStatus === StepProgress.Succeeded) {
            return `<span style="color: green"> ✓ </span>`
        } else if (stepStatus === StepProgress.Pending) {
            return `<span> <i class="fas fa-spinner fa-spin"></i> </span>` // TODO: switch from FA to native VSCode icons
        } else {
            return `<span style="color: red"> X </span>`
        }
    }
}
