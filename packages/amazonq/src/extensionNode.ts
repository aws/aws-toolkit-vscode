/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateAmazonQCommon, amazonQContextPrefix, deactivateCommon } from './extension'
import { DefaultAmazonQAppInitContext } from 'aws-core-vscode/amazonq'
import { activate as activateQGumby } from 'aws-core-vscode/amazonqGumby'
import { ExtContext, globals, CrashMonitoring, getLogger, isNetworkError, isSageMaker } from 'aws-core-vscode/shared'
import { filetypes, SchemaService } from 'aws-core-vscode/sharedNode'
import { updateDevMode } from 'aws-core-vscode/dev'
import { CommonAuthViewProvider } from 'aws-core-vscode/login'
import { isExtensionActive, VSCODE_EXTENSION_ID } from 'aws-core-vscode/utils'
import { registerSubmitFeedback } from 'aws-core-vscode/feedback'
import { DevOptions } from 'aws-core-vscode/dev'
import { Auth, AuthUtils, getTelemetryMetadataForConn, isAnySsoConnection } from 'aws-core-vscode/auth'
import api from './api'
import { activate as activateCWChat } from './app/chat/activation'
import { beta } from 'aws-core-vscode/dev'
import { activate as activateNotifications, NotificationsController } from 'aws-core-vscode/notifications'
import { AuthState, AuthUtil } from 'aws-core-vscode/codewhisperer'
import { telemetry, AuthUserState } from 'aws-core-vscode/telemetry'

export async function activate(context: vscode.ExtensionContext) {
    // IMPORTANT: No other code should be added to this function. Place it in one of the following 2 functions where appropriate.
    await activateAmazonQCommon(context, false)
    await activateAmazonQNode(context)

    return api
}

/**
 * The code in this function is not common, implying it only works in Node.js and not web.
 * The goal should be for this to not exist and that all code is "common". So if possible make
 * the code compatible with web and move it to {@link activateAmazonQCommon}.
 */
async function activateAmazonQNode(context: vscode.ExtensionContext) {
    // Intentionally do not await since this is slow and non-critical
    void (await CrashMonitoring.instance())?.start()

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

    globals.schemaService = new SchemaService()
    filetypes.activate()

    await setupDevMode(context)
    await beta.activate(context)

    // TODO: Should probably emit for web as well.
    // Will the web metric look the same?
    telemetry.auth_userState.emit({
        passive: true,
        result: 'Succeeded',
        source: AuthUtils.ExtensionUse.instance.sourceForTelemetry(),
        ...(await getAuthState()),
    })

    void activateNotifications(context, getAuthState)
}

async function getAuthState(): Promise<Omit<AuthUserState, 'source'>> {
    let authState: AuthState = 'disconnected'
    try {
        // May call connection validate functions that try to refresh the token.
        // This could result in network errors.
        authState = (await AuthUtil.instance._getChatAuthState(false)).codewhispererChat
    } catch (err) {
        if (
            isNetworkError(err) &&
            AuthUtil.instance.conn &&
            AuthUtil.instance.auth.getConnectionState(AuthUtil.instance.conn) === 'valid'
        ) {
            authState = 'connectedWithNetworkError'
        } else {
            throw err
        }
    }
    const currConn = AuthUtil.instance.conn
    if (currConn !== undefined && !(isAnySsoConnection(currConn) || isSageMaker())) {
        getLogger().error(`Current Amazon Q connection is not SSO, type is: %s`, currConn?.type)
    }

    return {
        authStatus:
            authState === 'connected' || authState === 'expired' || authState === 'connectedWithNetworkError'
                ? authState
                : 'notConnected',
        authEnabledConnections: AuthUtils.getAuthFormIdsFromConnection(currConn).join(','),
        ...(await getTelemetryMetadataForConn(currConn)),
    }
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
        auth: () => Auth.instance,
        notificationsController: () => NotificationsController.instance,
        menuOptions: [
            'editStorage',
            'resetState',
            'showEnvVars',
            'deleteSsoConnections',
            'expireSsoConnections',
            'editAuthConnections',
            'notificationsSend',
            'forceIdeCrash',
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
    // Run concurrently to speed up execution. stop() does not throw so it is safe
    await Promise.all([(await CrashMonitoring.instance())?.shutdown(), deactivateCommon()])
}
