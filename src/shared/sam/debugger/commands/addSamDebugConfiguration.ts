/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LaunchConfiguration } from '../../../debug/launchConfiguration'
import { createTemplateAwsSamDebugConfig } from '../awsSamDebugConfiguration'
import { CloudFormationTemplateRegistry } from '../../../cloudformation/templateRegistry'
import { getExistingConfiguration } from '../../../../lambda/config/templates'
import { localize } from '../../../utilities/vsCodeUtils'

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

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(templateUri)
    let preloadedConfig = undefined

    if (workspaceFolder) {
        const registry = CloudFormationTemplateRegistry.getRegistry()
        const templateDatum = registry.getRegisteredTemplate(templateUri.fsPath)
        if (templateDatum) {
            const resource = templateDatum.template.Resources![resourceName]
            if (resource && resource.Properties) {
                const existingConfig = await getExistingConfiguration(
                    workspaceFolder,
                    resource.Properties.Handler,
                    templateUri
                )
                if (existingConfig) {
                    const responseYes: string = localize('AWS.generic.response.yes', 'Yes')
                    const responseNo: string = localize('AWS.generic.response.no', 'No')
                    const prompt = await vscode.window.showInformationMessage(
                        localize(
                            'AWS.sam.debugger.useExistingConfig',
                            'The Toolkit has detected an existing legacy configuration for this function handler. Would you like it added to your Debug Configuration?'
                        ),
                        { modal: true },
                        responseYes,
                        responseNo
                    )
                    if (prompt === responseYes) {
                        preloadedConfig = existingConfig
                    } else if (!prompt) {
                        // User selected "Cancel". Abandon config creation
                        return
                    }
                }
            }
        }
    }

    const samDebugConfig = createTemplateAwsSamDebugConfig(resourceName, templateUri.fsPath, preloadedConfig)

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
