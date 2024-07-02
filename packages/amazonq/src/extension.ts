/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateAmazonQCommon, amazonQContextPrefix, deactivateCommon } from './extensionCommon'
import { DefaultAmazonQAppInitContext, activate as activateCWChat } from 'aws-core-vscode/amazonq'
import { activate as activateQGumby } from 'aws-core-vscode/amazonqGumby'
import { ExtContext } from 'aws-core-vscode/shared'
import { updateDevMode } from 'aws-core-vscode/dev'
import { CommonAuthViewProvider } from 'aws-core-vscode/login'
import { isExtensionActive, VSCODE_EXTENSION_ID } from 'aws-core-vscode/utils'
import { registerSubmitFeedback } from 'aws-core-vscode/feedback'
import { DevOptions } from 'aws-core-vscode/dev'
import { Auth } from 'aws-core-vscode/auth'
import qApi from './api'

export async function activate(context: vscode.ExtensionContext) {
    // IMPORTANT: No other code should be added to this function. Place it in one of the following 2 functions where appropriate.
    await activateAmazonQCommon(context, false)
    await activateAmazonQNonCommon(context)

    return qApi
}

/**
 * The code in this function is not common, implying it only works in Node.js and not web.
 * The goal should be for this to not exist and that all code is "common". So if possible make
 * the code compatible with web and move it to {@link activateAmazonQCommon}.
 */
async function activateAmazonQNonCommon(context: vscode.ExtensionContext) {
    const extContext = {
        extensionContext: context,
    }
    await activateCWChat(context)
    await activateQGumby(extContext as ExtContext)

    const authProvider = new CommonAuthViewProvider(
        context,
        amazonQContextPrefix,
        DefaultAmazonQAppInitContext.instance.onDidChangeAmazonQVisibility
    )
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(authProvider.viewType, authProvider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }),
        registerSubmitFeedback(context, 'Amazon Q', amazonQContextPrefix)
    )

    await setupDevMode(context)
}

/**
 * Some parts of this do not work in Web mode so we need to set Dev Mode up here.
 *
 * TODO: Get the following working in web mode as well and then move this function.
 */
async function setupDevMode(context: vscode.ExtensionContext) {
    // At some point this imports CodeCatalyst code which breaks in web mode.
    // TODO: Make this work in web mode and move it to extensionCommon.ts
    await updateDevMode()

    const devOptions: DevOptions = {
        context,
        auth: Auth.instance,
        menuOptions: [
            'editStorage',
            'showEnvVars',
            'deleteSsoConnections',
            'expireSsoConnections',
            'editAuthConnections',
        ],
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('amazonq.dev.openMenu', async () => {
            if (!isExtensionActive(VSCODE_EXTENSION_ID.awstoolkit)) {
                void vscode.window.showErrorMessage('AWS Toolkit must be installed to access the Developer Menu.')
                return
            }
            await vscode.commands.executeCommand('_aws.dev.invokeMenu', devOptions)
        })
    )
}

export async function deactivate() {
    await deactivateCommon()
}
