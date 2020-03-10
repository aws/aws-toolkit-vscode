/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { _Blob } from 'aws-sdk/clients/lambda'
import _ = require('lodash')
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { ExtensionUtilities } from '../../shared/extensionUtilities'
import { getLogger, Logger } from '../../shared/logger'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { FeedbackTemplates } from '../templates/feedbackTemplates'
import { submitFeedbackListener } from './submitFeedbackListener'

export async function submitFeedback(listener?: (message: any) => Promise<void>) {
    const logger: Logger = getLogger()

    try {
        const panel = vscode.window.createWebviewPanel('html', 'Submit Quick Feedback', vscode.ViewColumn.One, {
            retainContextWhenHidden: true,
            enableScripts: true
        })
        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)

        panel.webview.html = baseTemplateFn({
            content: '<h1>Loading...</h1>'
        })

        const feedbackTemplateFn = _.template(FeedbackTemplates.SUBMIT_TEMPLATE)

        try {
            const loadScripts = ExtensionUtilities.getScriptsForHtml(['submitFeedbackVue.js'])
            const loadLibs = ExtensionUtilities.getLibrariesForHtml(['vue.min.js'])
            const loadStylesheets = ExtensionUtilities.getCssForHtml(['submitFeedback.css'])

            panel.webview.html = baseTemplateFn({
                content: feedbackTemplateFn({
                    Scripts: loadScripts,
                    Libraries: loadLibs,
                    Stylesheets: loadStylesheets
                })
            })

            const feedbackListener = listener === undefined ? createListener(panel) : listener
            panel.webview.onDidReceiveMessage(feedbackListener, undefined, ext.context.subscriptions)
        } catch (err) {
            logger.error('Failed to create feedback web view', err as Error)
        }
    } catch (err) {
        logger.error(err as Error)
    }
}

function createListener(panel: vscode.WebviewPanel) {
    const feedbackPanel = {
        postMessage: (message: any) => panel.webview.postMessage(message),
        // tslint:disable-next-line: no-unsafe-any
        dispose: () => panel.dispose()
    }

    const window = {
        showInformationMessage: (message: string) => vscode.window.showInformationMessage(message)
    }

    return submitFeedbackListener(feedbackPanel, window, ext.telemetry)
}
