/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LaunchConfiguration } from '../../shared/debug/launchConfiguration'
import { createDirectInvokeSamDebugConfigurationFromTemplate } from '../../shared/sam/debugger/awsSamDebugger'

export interface AddSamDebugConfigurationInput {
    samTemplateResourceName: string
    samTemplateUri: vscode.Uri
}

/**
 * Adds a new debug configuration for the given sam function resource and template.
 */
export async function addSamDebugConfiguration({
    samTemplateResourceName: resourceName,
    samTemplateUri: templateUri
}: AddSamDebugConfigurationInput): Promise<void> {
    // tslint:disable-next-line: no-floating-promises
    emitClickTelemetry()

    const samDebugConfig = createDirectInvokeSamDebugConfigurationFromTemplate(resourceName, templateUri.fsPath)

    const launchConfig = new LaunchConfiguration(templateUri)
    await launchConfig.addDebugConfiguration(samDebugConfig)

    await showDebugConfiguration()
}

async function showDebugConfiguration() {
    return vscode.commands.executeCommand('workbench.action.debug.configure')
}

async function emitClickTelemetry() {}
