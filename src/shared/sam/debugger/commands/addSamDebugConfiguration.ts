/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LaunchConfiguration } from '../../../debug/launchConfiguration'
import { createAwsSamDebugConfigurationForTemplate } from '../awsSamDebugConfiguration'

export interface AddSamDebugConfigurationInput {
    resourceName: string
    templateUri: vscode.Uri
}

/**
 * Adds a new debug configuration for the given sam function resource and template.
 */
export async function addSamDebugConfiguration({
    resourceName,
    templateUri,
}: AddSamDebugConfigurationInput): Promise<void> {
    // tslint:disable-next-line: no-floating-promises
    emitCommandTelemetry()

    const samDebugConfig = createAwsSamDebugConfigurationForTemplate(resourceName, templateUri.fsPath)

    const launchConfig = new LaunchConfiguration(templateUri)
    await launchConfig.addDebugConfiguration(samDebugConfig)

    await showDebugConfiguration()
}

async function showDebugConfiguration(): Promise<void> {
    vscode.commands.executeCommand('workbench.action.debug.configure')
}

async function emitCommandTelemetry(): Promise<void> {
    // TODO add new metric for when command is executed
}
