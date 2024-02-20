/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { BaseTemplates } from './templates/baseTemplates'
import { fsCommon } from '../srcShared/fs'
import { getIdeProperties, isCloud9, isCn } from './extensionUtilities'

const localize = nls.loadMessageBundle()

/**
 * Helper function to show a webview containing the quick start page
 *
 * @param context VS Code Extension Context
 */
export async function showQuickStartWebview(context: vscode.ExtensionContext): Promise<void> {
    try {
        const view = await createQuickStartWebview(context)
        view.reveal()
    } catch {
        await vscode.window.showErrorMessage(
            localize('AWS.command.quickStart.error', 'Error while loading Quick Start page')
        )
    }
}

/**
 * Helper function to create a webview containing the quick start page
 * Returns an unfocused vscode.WebviewPanel if the quick start page is renderable.
 *
 * @param context VS Code Extension Context
 * @param page Page to load (use for testing)
 */
export async function createQuickStartWebview(
    context: vscode.ExtensionContext,
    page?: string
): Promise<vscode.WebviewPanel> {
    let actualPage: string
    if (page) {
        actualPage = page
    } else if (isCloud9()) {
        actualPage = `quickStartCloud9${isCn() ? '-cn' : ''}.html`
    } else {
        actualPage = 'quickStartVscode.html'
    }
    // create hidden webview, leave it up to the caller to show
    const view = vscode.window.createWebviewPanel(
        'html',
        localize('AWS.command.quickStart.title', '{0} Toolkit - Quick Start', getIdeProperties().company),
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
        { enableScripts: true }
    )

    const baseTemplateFn = _.template(BaseTemplates.simpleHtml)

    const htmlBody = convertExtensionRootTokensToPath(
        await fsCommon.readFileAsString(path.join(context.extensionPath, actualPage)),
        context.extensionPath,
        view.webview
    )

    view.webview.html = baseTemplateFn({
        cspSource: view.webview.cspSource,
        content: htmlBody,
    })

    return view
}

/**
 * Utility function to search for tokens in a string and convert them to relative paths parseable by VS Code
 * Useful for converting HTML images to webview-usable images
 *
 * @param text Text to scan
 * @param basePath Extension path (from extension context)
 */
function convertExtensionRootTokensToPath(text: string, basePath: string, webview: vscode.Webview): string {
    return text.replace(/!!EXTENSIONROOT!!(?<restOfUrl>[-a-zA-Z0-9@:%_\+.~#?&//=]*)/g, (matchedString, restOfUrl) => {
        return webview.asWebviewUri(vscode.Uri.file(`${basePath}${restOfUrl}`)).toString()
    })
}
