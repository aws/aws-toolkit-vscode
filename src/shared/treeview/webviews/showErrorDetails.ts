/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import _ = require('lodash')
import * as vscode from 'vscode'
import { getLogger, Logger } from '../../logger'
import { BaseTemplates } from '../../templates/baseTemplates'
import { ErrorNode } from '../nodes/errorNode'
import { ErrorTemplates } from './errorTemplates'

export async function showErrorDetails(element: ErrorNode) {

    const logger: Logger = getLogger()

    const view = vscode.window.createWebviewPanel(
        'html',
        `Error details for ${element.parent.label}`,
        vscode.ViewColumn.Active
    )

    try {
        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        view.webview.html = baseTemplateFn({ content:  `<h1>${localize('AWS.message.loading', 'Loading...')}</h1>` })

        const showErrorDetailsTemplateFn = _.template(ErrorTemplates.SHOW_ERROR_DETAILS)
        view.webview.html = baseTemplateFn({
            content: showErrorDetailsTemplateFn(element)
        })

    } catch (err) {
        const error = err as Error
        logger.error(error.message)

        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        view.webview.html = baseTemplateFn({ content: `Error displaying error details: ${error.message}` })
    }
}
