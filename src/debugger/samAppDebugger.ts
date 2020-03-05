/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

const SAM_APP_DEBUG_TYPE = 'sam-app'
const SAM_APP_REQUEST_TYPES = new Set<string>(['direct-invoke'])
const SAM_APP_TARGET_TYPES = new Set<string>(['template', 'code'])

export interface SamAppDebugConfiguration extends vscode.DebugConfiguration {
    readonly invokeTarget: {
        readonly target: string
        readonly samTemplatePath: string
        readonly samTemplateResource: string
    }
    readonly lambda?: {
        // TODO: Turn samLambdaRuntimes into a type?
        readonly runtime?: string
        readonly timeoutSec?: number
        readonly memoryMb?: number
        readonly environmentVariables?: JsonObject
        readonly event?: {
            readonly path?: string
            readonly json?: JsonObject
        }
    }
    readonly sam?: {
        readonly containerBuild?: boolean
        readonly skipNewImageCheck?: boolean
        readonly dockerNetwork?: string
        readonly buildArguments?: string
        readonly localArguments?: string
        readonly template?: {
            readonly parameters?: JsonObject
        }
    }
    readonly aws?: {
        readonly credentials?: string
        readonly region?: string
    }
}

interface JsonObject {
    readonly [key: string]: string
}

export function activate(extContext: vscode.ExtensionContext) {
    const provider = vscode.debug.registerDebugConfigurationProvider(
        SAM_APP_DEBUG_TYPE,
        new SamAppDebugConfigurationProvider()
    )

    extContext.subscriptions.push(provider)
}

class SamAppDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    public constructor() {}

    public provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<SamAppDebugConfiguration[]> {
        return undefined
    }

    public resolveDebugConfiguration?(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: SamAppDebugConfiguration,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<SamAppDebugConfiguration> {
        if (!SAM_APP_REQUEST_TYPES.has(debugConfiguration.request)) {
            vscode.window.showInformationMessage('Invalid request type')
        }
        if (!SAM_APP_TARGET_TYPES.has(debugConfiguration.invokeTarget.target)) {
            vscode.window.showInformationMessage('Invalid invokeTarget.target type')
        }
        vscode.window.showInformationMessage('Not implemented')

        return undefined
    }
}
