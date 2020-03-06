/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsSamDebuggerConfiguration } from './awsSamDebugConfiguration'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam'
const AWS_SAM_DEBUG_REQUEST_TYPES = new Set<string>(['direct-invoke'])
const AWS_SAM_DEBUG_TARGET_TYPES = new Set<string>(['template', 'code'])

export class AwsSamDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    public constructor() {}

    public async provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration[] | undefined> {
        return undefined
    }

    public async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration | undefined> {
        if (!AWS_SAM_DEBUG_REQUEST_TYPES.has(debugConfiguration.request)) {
            vscode.window.showInformationMessage('Invalid request type')
        }
        if (
            debugConfiguration.invokeTarget &&
            debugConfiguration.invokeTarget.target &&
            !AWS_SAM_DEBUG_TARGET_TYPES.has(debugConfiguration.invokeTarget.target)
        ) {
            vscode.window.showInformationMessage('Invalid invokeTarget.target type')
        }
        vscode.window.showInformationMessage('Not implemented')

        return undefined
    }
}
