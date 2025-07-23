/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../../shared/vscode/commands2'
import { VueWebview } from '../../webviews/main'
import { createJobPage, viewJobsPage } from './utils/constants'
import { NotebookJobWebview } from './backend/notebookJobWebview'

const Panel = VueWebview.compilePanel(NotebookJobWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let webviewPanel: vscode.WebviewPanel | undefined
let subscriptions: vscode.Disposable[] | undefined

/**
 * Entry point. Register create notebook job and view notebook jobs commands.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    extensionContext.subscriptions.push(registerCreateJobCommand(extensionContext))
    extensionContext.subscriptions.push(registerViewJobsCommand(extensionContext))
}

/**
 * Returns create notebook job command.
 */
function registerCreateJobCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return Commands.register('aws.smus.notebookscheduling.createjob', async () => {
        const title = 'Create job'

        if (activePanel && webviewPanel) {
            // Instruct frontend to show create job page
            activePanel.server.setCurrentPage(createJobPage)
            webviewPanel.title = title
            webviewPanel.reveal()
        } else {
            await createWebview(context, createJobPage, title)
        }
    })
}

/**
 * Returns view notebook jobs command.
 */
function registerViewJobsCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return Commands.register('aws.smus.notebookscheduling.viewjobs', async () => {
        const title = 'View notebook jobs'

        if (activePanel && webviewPanel) {
            // Instruct frontend to show view notebook jobs page
            activePanel.server.setCurrentPage(viewJobsPage)
            webviewPanel.title = title
            webviewPanel.reveal()
        } else {
            await createWebview(context, viewJobsPage, title)
        }
    })
}

/**
 * We are using single webview panel for frontend. Here we are creating this single instance of webview panel, and listening to its lifecycle events.
 */
async function createWebview(context: vscode.ExtensionContext, page: string, title: string): Promise<void> {
    activePanel = new Panel(context)
    activePanel.server.setCurrentPage(page)

    webviewPanel = await activePanel.show({
        title,
        viewColumn: vscode.ViewColumn.Active,
    })

    if (!subscriptions) {
        subscriptions = [
            webviewPanel.onDidDispose(() => {
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                webviewPanel = undefined
                subscriptions = undefined
            }),
        ]
    }
}
