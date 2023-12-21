/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { getExistingConfiguration } from '../../../../lambda/config/templates'
import { createRuntimeQuickPick, getDefaultRuntime, RuntimeFamily } from '../../../../lambda/models/samLambdaRuntime'
import { localize } from '../../../utilities/vsCodeUtils'
import {
    API_TARGET_TYPE,
    AwsSamDebuggerConfiguration,
    CODE_TARGET_TYPE,
    createApiAwsSamDebugConfig,
    createCodeAwsSamDebugConfig,
    createTemplateAwsSamDebugConfig,
    TEMPLATE_TARGET_TYPE,
} from '../awsSamDebugConfiguration'
import * as CloudFormation from '../../../cloudformation/cloudformation'
import { LaunchConfiguration } from '../../../debug/launchConfiguration'
import { getIdeProperties } from '../../../extensionUtilities'
import { isValidResponse } from '../../../wizards/wizard'
import globals from '../../../extensionGlobals'

/**
 * Holds information required to create a launch config
 * @field resourceName: Resource being used. For templates, this is the resource name in the CFN stack. For code, this is the handler's name
 * @field rootUri: The code root. For templates, this is the CodeUri value. For code, this is the manifest's URI.
 */
export interface AddSamDebugConfigurationInput {
    resourceName: string
    rootUri: vscode.Uri
    apiEvent?: { name: string; event: CloudFormation.Event }
    runtimeFamily?: RuntimeFamily
}

/**
 * Adds a new debug configuration for the given sam function resource and template.
 */
export async function addSamDebugConfiguration(
    { resourceName, rootUri, apiEvent, runtimeFamily }: AddSamDebugConfigurationInput,
    type: typeof CODE_TARGET_TYPE | typeof TEMPLATE_TARGET_TYPE | typeof API_TARGET_TYPE,
    openWebview: boolean,
    step?: { step: number; totalSteps: number }
): Promise<void> {
    // emit without waiting
    emitCommandTelemetry()

    let samDebugConfig: AwsSamDebuggerConfiguration
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(rootUri)
    let runtimeName = runtimeFamily ? getDefaultRuntime(runtimeFamily) : undefined
    let addRuntimeNameToConfig = false

    // both of these config types use templates
    if (type === TEMPLATE_TARGET_TYPE || type === API_TARGET_TYPE) {
        let preloadedConfig = undefined

        if (workspaceFolder) {
            const templateDatum = (await globals.templateRegistry).getItem(rootUri)
            if (templateDatum) {
                const resource = templateDatum.item.Resources![resourceName]
                if (!resource) {
                    return
                }

                if (CloudFormation.isZipLambdaResource(resource.Properties)) {
                    if (type === TEMPLATE_TARGET_TYPE) {
                        const handler = CloudFormation.getStringForProperty(
                            resource.Properties,
                            'Handler',
                            templateDatum.item
                        )
                        const existingConfig = await getExistingConfiguration(workspaceFolder, handler ?? '', rootUri)
                        if (existingConfig) {
                            const responseMigrate: string = localize(
                                'AWS.sam.debugger.useExistingConfig.migrate',
                                'Create based on the legacy config'
                            )
                            const responseNew: string = localize(
                                'AWS.sam.debugger.useExistingConfig.doNotMigrate',
                                'Create new config only'
                            )
                            const prompt = await vscode.window.showInformationMessage(
                                localize(
                                    'AWS.sam.debugger.useExistingConfig',
                                    '{0} Toolkit detected an existing legacy configuration for this function. Create the debug config based on the legacy config?',
                                    getIdeProperties().company
                                ),
                                { modal: true },
                                responseMigrate,
                                responseNew
                            )
                            if (!prompt) {
                                // User selected "Cancel". Abandon config creation
                                return
                            } else if (prompt === responseMigrate) {
                                preloadedConfig = existingConfig
                            }
                        }
                    }
                } else if (CloudFormation.isImageLambdaResource(resource.Properties)) {
                    const quickPick = createRuntimeQuickPick({
                        showImageRuntimes: false,
                        runtimeFamily,
                    })

                    const choices = await quickPick.prompt()

                    if (!isValidResponse(choices)) {
                        return
                    }

                    runtimeName = choices.runtime
                    addRuntimeNameToConfig = true
                }
            }
        }

        if (type === TEMPLATE_TARGET_TYPE) {
            samDebugConfig = createTemplateAwsSamDebugConfig(
                workspaceFolder,
                runtimeName,
                addRuntimeNameToConfig,
                resourceName,
                rootUri.fsPath,
                preloadedConfig
            )
        } else {
            // If the event has no properties, the default will be used
            const apiConfig = {
                path: apiEvent?.event.Properties?.Path,
                httpMethod: apiEvent?.event.Properties?.Method,
                payload: apiEvent?.event.Properties?.Payload,
            }

            samDebugConfig = createApiAwsSamDebugConfig(
                workspaceFolder,
                runtimeName,
                resourceName,
                rootUri.fsPath,
                apiConfig
            )
        }
    } else if (type === CODE_TARGET_TYPE) {
        const quickPick = createRuntimeQuickPick({
            showImageRuntimes: false,
            runtimeFamily,
            step: step?.step,
            totalSteps: step?.totalSteps,
        })

        const choices = await quickPick.prompt()

        if (!isValidResponse(choices)) {
            return
        }

        // strip the manifest's URI to the manifest's dir here. More reliable to do this here than converting back and forth between URI/string up the chain.
        samDebugConfig = createCodeAwsSamDebugConfig(
            workspaceFolder,
            resourceName,
            path.dirname(rootUri.fsPath),
            choices.runtime
        )
    } else {
        throw new Error('Unrecognized debug target type')
    }

    if (openWebview) {
        vscode.commands.executeCommand('aws.launchConfigForm', samDebugConfig)
    } else {
        const launchConfig = new LaunchConfiguration(rootUri)
        await launchConfig.addDebugConfiguration(samDebugConfig)

        await openLaunchJsonFile()
    }
}

export async function openLaunchJsonFile(): Promise<void> {
    await vscode.commands.executeCommand(
        vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length <= 1
            ? 'workbench.action.debug.configure'
            : 'workbench.action.openWorkspaceSettingsFile'
    )
}

async function emitCommandTelemetry(): Promise<void> {
    // TODO add new metric for when command is executed
}
