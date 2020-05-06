/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { LaunchConfiguration } from '../../../debug/launchConfiguration'
import {
    AwsSamDebuggerConfiguration,
    CODE_TARGET_TYPE,
    createCodeAwsSamDebugConfig,
    createTemplateAwsSamDebugConfig,
    TEMPLATE_TARGET_TYPE,
} from '../awsSamDebugConfiguration'
import { CloudFormationTemplateRegistry } from '../../../cloudformation/templateRegistry'
import { getExistingConfiguration } from '../../../../lambda/config/templates'
import { localize } from '../../../utilities/vsCodeUtils'
import { RuntimeFamily } from '../../../../lambda/models/samLambdaRuntime'

/**
 * Holds information required to create a launch config
 * @field resourceName: Resource being used. For templates, this is the resource name in the CFN stack. For code, this is the handler's name
 * @field rootUri: The code root. For templates, this is the CodeUri value. For code, this is the manifest's URI.
 */
export interface AddSamDebugConfigurationInput {
    resourceName: string
    rootUri: vscode.Uri
    runtimeFamily?: RuntimeFamily
}

/**
 * Adds a new debug configuration for the given sam function resource and template.
 */
export async function addSamDebugConfiguration(
    { resourceName, rootUri, runtimeFamily }: AddSamDebugConfigurationInput,
    type: typeof CODE_TARGET_TYPE | typeof TEMPLATE_TARGET_TYPE
): Promise<void> {
    // tslint:disable-next-line: no-floating-promises
    emitCommandTelemetry()

    let samDebugConfig: AwsSamDebuggerConfiguration
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(rootUri)

    if (type === TEMPLATE_TARGET_TYPE) {
        let preloadedConfig = undefined

        if (workspaceFolder) {
            const registry = CloudFormationTemplateRegistry.getRegistry()
            const templateDatum = registry.getRegisteredTemplate(rootUri.fsPath)
            if (templateDatum) {
                const resource = templateDatum.template.Resources![resourceName]
                if (resource && resource.Properties) {
                    const existingConfig = await getExistingConfiguration(
                        workspaceFolder,
                        resource.Properties.Handler,
                        rootUri
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
                        if (!prompt) {
                            // User selected "Cancel". Abandon config creation
                            return
                        } else if (prompt === responseYes) {
                            preloadedConfig = existingConfig
                        }
                    }
                }
            }
        }
        samDebugConfig = createTemplateAwsSamDebugConfig(workspaceFolder, resourceName, rootUri.fsPath, preloadedConfig)
    } else if (type === CODE_TARGET_TYPE) {
        // strip the manifest's URI to the manifest's dir here. More reliable to do this here than converting back and forth between URI/string up the chain.
        samDebugConfig = createCodeAwsSamDebugConfig(
            workspaceFolder,
            resourceName,
            path.dirname(rootUri.fsPath),
            runtimeFamily
        )
    } else {
        throw new Error('Unrecognized debug target type')
    }

    const launchConfig = new LaunchConfiguration(rootUri)
    await launchConfig.addDebugConfiguration(samDebugConfig)

    await showDebugConfiguration()
}

async function showDebugConfiguration(): Promise<void> {
    vscode.commands.executeCommand('workbench.action.debug.configure')
}

async function emitCommandTelemetry(): Promise<void> {
    // TODO add new metric for when command is executed
}
