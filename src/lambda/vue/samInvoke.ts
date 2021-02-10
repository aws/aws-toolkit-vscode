/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsSamDebuggerConfiguration } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { createVueWebview } from '../../webviews/main'

export function registerSamInvokeVueCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand('aws.lambda.vueTest', async () => {
        await createVueWebview({
            id: 'create',
            name: 'VueTest',
            webviewJs: 'samInvokeVue.js',
            onDidReceiveMessageFunction: handleFrontendToBackendMessage,
            context,
        })
    })
}

export interface BackendToFrontend {
    command: 'loadLaunchConfig' | 'loadSamplePayload' | 'loadTemplates'
}

export interface FrontendToBackendBasicRequest {
    command: 'loadSamLaunchConfig' | 'getSamplePayload' | 'getTemplates'
}

export interface FrontendToBackendLaunchConfigRequest {
    command: 'saveLaunchConfig' | 'invokeLaunchConfig'
    data: {
        launchConfig: AwsSamDebuggerConfiguration
    }
}

async function handleFrontendToBackendMessage(
    message: FrontendToBackendBasicRequest | FrontendToBackendLaunchConfigRequest,
    postMessageFn: (response: BackendToFrontend) => Thenable<boolean>,
    destroyWebviewFn: () => any
): Promise<any> {
    switch (message.command) {
        case 'loadSamLaunchConfig':
            loadSamLaunchConfig(postMessageFn)
            break
        case 'getSamplePayload':
            getSamplePayload(postMessageFn)
            break
        case 'getTemplates':
            getTemplates(postMessageFn)
            break
        case 'saveLaunchConfig':
            saveLaunchConfig(message.data.launchConfig)
            break
        case 'invokeLaunchConfig':
            invokeLaunchConfig(message.data.launchConfig)
            break
    }
}

/**
 * Open a quick pick containing the names of launch configs in the `launch.json` array.
 * Filter out non-supported launch configs.
 * Call back into the webview with the selected launch config.
 * @param postMessageFn
 */
async function loadSamLaunchConfig(postMessageFn: (response: BackendToFrontend) => Thenable<boolean>) {}

/**
 * Open a quick pick containing upstream sample payloads.
 * Call back into the webview with the contents of the payload to add to the JSON field.
 * @param postMessageFn
 */
async function getSamplePayload(postMessageFn: (response: BackendToFrontend) => Thenable<boolean>) {}

/**
 * Get all templates in the registry.
 * Call back into the webview with the registry contents.
 * @param postMessageFn
 */
async function getTemplates(postMessageFn: (response: BackendToFrontend) => Thenable<boolean>) {}

/**
 * Open a quick pick containing the names of launch configs in the `launch.json` array, plus a "Create New Entry" entry.
 * On selecting a name, overwrite the existing entry in the `launch.json` array and resave the file.
 * On selecting "Create New Entry", prompt the user for a name and save the contents to the end of the `launch.json` array.
 * @param config Config to save
 */
async function saveLaunchConfig(config: AwsSamDebuggerConfiguration) {}

/**
 * Validate and execute the provided launch config.
 * @param config
 */
async function invokeLaunchConfig(config: AwsSamDebuggerConfiguration) {}
