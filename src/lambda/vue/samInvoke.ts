/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LaunchConfiguration } from '../../shared/debug/launchConfiguration'
import { ExtContext } from '../../shared/extensions'
import {
    AwsSamDebuggerConfiguration,
    isCodeTargetProperties,
    isTemplateTargetProperties,
} from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { SamDebugConfigProvider } from '../../shared/sam/debugger/awsSamDebugger'
import { createVueWebview } from '../../webviews/main'

export function registerSamInvokeVueCommand(context: ExtContext): vscode.Disposable {
    return vscode.commands.registerCommand('aws.lambda.vueTest', async () => {
        await createVueWebview<SamInvokerRequest, SamInvokerResponse, any>({
            id: 'create',
            name: 'VueTest',
            webviewJs: 'samInvokeVue.js',
            onDidReceiveMessageFunction: async (message, postMessageFn, destroyWebviewFn) =>
                handleFrontendToBackendMessage(message, postMessageFn, destroyWebviewFn, context),
            context: context.extensionContext,
        })
    })
}

// TODO: Better names for all the interfaces

export interface SamInvokerResponse {
    command: 'TODO: Define events that the frontend can use'
}

export interface SamInvokerBasicRequest {
    command: 'loadSamLaunchConfig' | 'getSamplePayload' | 'getTemplates'
}

export interface SamInvokerLaunchRequest {
    command: 'saveLaunchConfig' | 'invokeLaunchConfig'
    data: {
        launchConfig: AwsSamDebuggerConfiguration
    }
}

export type SamInvokerRequest = SamInvokerBasicRequest | SamInvokerLaunchRequest

async function handleFrontendToBackendMessage(
    message: SamInvokerRequest,
    postMessageFn: (response: SamInvokerResponse) => Thenable<boolean>,
    destroyWebviewFn: () => any,
    context: ExtContext
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
            invokeLaunchConfig(message.data.launchConfig, context)
            break
    }
}

/**
 * Open a quick pick containing the names of launch configs in the `launch.json` array.
 * Filter out non-supported launch configs.
 * Call back into the webview with the selected launch config.
 * @param postMessageFn
 */
async function loadSamLaunchConfig(postMessageFn: (response: SamInvokerResponse) => Thenable<boolean>): Promise<void> {}

/**
 * Open a quick pick containing upstream sample payloads.
 * Call back into the webview with the contents of the payload to add to the JSON field.
 * @param postMessageFn
 */
async function getSamplePayload(postMessageFn: (response: SamInvokerResponse) => Thenable<boolean>): Promise<void> {}

/**
 * Get all templates in the registry.
 * Call back into the webview with the registry contents.
 * @param postMessageFn
 */
async function getTemplates(postMessageFn: (response: SamInvokerResponse) => Thenable<boolean>): Promise<void> {}

/**
 * Open a quick pick containing the names of launch configs in the `launch.json` array, plus a "Create New Entry" entry.
 * On selecting a name, overwrite the existing entry in the `launch.json` array and resave the file.
 * On selecting "Create New Entry", prompt the user for a name and save the contents to the end of the `launch.json` array.
 * @param config Config to save
 */
async function saveLaunchConfig(config: AwsSamDebuggerConfiguration): Promise<void> {
    const uri = getUriFromLaunchConfig(config)
    if (!uri) {
        // TODO Localize
        vscode.window.showErrorMessage('Toolkit requires a target resource in order to save a debug configuration')
        return undefined
    }
    const launchConfig = new LaunchConfiguration(uri)
    const existingConfigs = launchConfig.getSamDebugConfigurations()
    // TODO: Create quick pick
    //
}

/**
 * Validate and execute the provided launch config.
 * TODO: Post validation failures back to webview?
 * @param config Config to invoke
 */
async function invokeLaunchConfig(config: AwsSamDebuggerConfiguration, context: ExtContext): Promise<void> {
    const provider = new SamDebugConfigProvider(context)

    const targetUri = getUriFromLaunchConfig(config)

    const folder = targetUri ? vscode.workspace.getWorkspaceFolder(targetUri) : undefined

    await provider.resolveDebugConfiguration(folder, config)
}

function getUriFromLaunchConfig(config: AwsSamDebuggerConfiguration): vscode.Uri | undefined {
    if (isTemplateTargetProperties(config.invokeTarget)) {
        return vscode.Uri.file(config.invokeTarget.templatePath)
    } else if (isCodeTargetProperties(config.invokeTarget)) {
        return vscode.Uri.file(config.invokeTarget.target)
    }
}
