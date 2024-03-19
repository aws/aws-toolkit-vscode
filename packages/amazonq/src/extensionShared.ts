/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { join } from 'path'
import { activate as activateCodeWhisperer, shutdown as codewhispererShutdown } from 'aws-core-vscode/codewhisperer'
import {
    ExtContext,
    initialize,
    activateLogger,
    activateTelemetry,
    Settings,
    DefaultAwsContext,
    initializeComputeRegion,
    DefaultAWSClientBuilder,
    globals,
    RegionProvider,
} from 'aws-core-vscode/shared'
import { initializeAuth, initializeAwsCredentialsStatusBarItem } from 'aws-core-vscode/auth'
import { makeEndpointsProvider } from 'aws-core-vscode'
import { activate as activateCWChat } from 'aws-core-vscode/amazonq'
import { activate as activateQGumby } from 'aws-core-vscode/amazonqGumby'
import { CommonAuthViewProvider } from 'aws-core-vscode/login'

export async function activateShared(context: vscode.ExtensionContext) {
    void vscode.window.showInformationMessage(
        'Amazon Q + CodeWhisperer: This extension is under development and offers no features at this time.'
    )

    await initializeComputeRegion()
    initialize(context)
    const extContext = {
        extensionContext: context,
    }
    globals.awsContext = new DefaultAwsContext()
    globals.sdkClientBuilder = new DefaultAWSClientBuilder(globals.awsContext)
    globals.manifestPaths.endpoints = context.asAbsolutePath(join('resources', 'endpoints.json'))
    globals.regionProvider = RegionProvider.fromEndpointsProvider(makeEndpointsProvider())

    const toolkitOutputChannel = vscode.window.createOutputChannel('AWS Toolkit', { log: true })
    await activateLogger(context, toolkitOutputChannel)
    await activateTelemetry(context, globals.awsContext, Settings.instance)

    await initializeAuth(context, globals.awsContext, globals.loginManager)
    await initializeAwsCredentialsStatusBarItem(globals.awsContext, context)

    await activateCodeWhisperer(extContext as ExtContext)
    await activateCWChat(context)
    await activateQGumby(extContext as ExtContext)

    const authProvider = new CommonAuthViewProvider(context, undefined, 'AMAZONQ')
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(CommonAuthViewProvider.viewType, authProvider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )

    await vscode.commands.executeCommand('setContext', 'aws.codewhisperer.connected', false)
}

export async function deactivateShared() {
    await codewhispererShutdown()
}
