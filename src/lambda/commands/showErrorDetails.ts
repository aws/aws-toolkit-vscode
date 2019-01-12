/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import _ = require('lodash')
import * as vscode from 'vscode'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { ErrorNode } from '../explorer/errorNode'
import { ErrorTemplates } from '../templates/errorTemplates'

export async function showErrorDetails(element: ErrorNode) {
    const view = vscode.window.createWebviewPanel(
        'html',
        `Error details for ${element.parent.label}`,
        -1
    )

    try {
        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        view.webview.html = baseTemplateFn({ content: '<h1>Loading...</h1>' })

        const showErrorDetailsTemplateFn = _.template(ErrorTemplates.SHOW_ERROR_DETAILS)
        view.webview.html = baseTemplateFn({
            content: showErrorDetailsTemplateFn(element)
        })

    } catch (err) {
        const error = err as Error
        console.log(error.message)

        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        view.webview.html = baseTemplateFn({ content: `Error displaying error details: ${error.message}` })
    }
}
