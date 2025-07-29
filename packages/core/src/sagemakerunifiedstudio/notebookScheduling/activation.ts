/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../../shared/vscode/commands2'
import { VueWebview } from '../../webviews/main'
import { createJobPage, viewJobsPage, Page } from './utils/constants'
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
        const page: Page = { name: createJobPage, metadata: {} }

        if (activePanel && webviewPanel) {
            // Instruct frontend to show create job page
            activePanel.server.setCurrentPage(page)
            webviewPanel.reveal()
        } else {
            await createWebview(context, page)
        }
    })
}

/**
 * Returns view notebook jobs command.
 */
function registerViewJobsCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return Commands.register('aws.smus.notebookscheduling.viewjobs', async () => {
        const page: Page = { name: viewJobsPage, metadata: {} }

        if (activePanel && webviewPanel) {
            // Instruct frontend to show view notebook jobs page
            activePanel.server.setCurrentPage(page)
            webviewPanel.reveal()
        } else {
            await createWebview(context, page)
        }
    })
}

/**
 * We are using single webview panel for frontend. Here we are creating this single instance of webview panel, and listening to its lifecycle events.
 */
async function createWebview(context: vscode.ExtensionContext, page: Page): Promise<void> {
    activePanel = new Panel(context)

    webviewPanel = await activePanel.show({
        title: 'Notebook Jobs',
        viewColumn: vscode.ViewColumn.Active,
    })

    activePanel.server.setWebviewPanel(webviewPanel)
    activePanel.server.setCurrentPage(page)

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
