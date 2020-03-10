/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudFormation } from '../../cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry'
import { AwsSamDebuggerConfiguration } from './awsSamDebugConfiguration'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam'
const DIRECT_INVOKE_TYPE = 'direct-invoke'
const TEMPLATE_TARGET_TYPE = 'template'

const AWS_SAM_DEBUG_REQUEST_TYPES = new Set<string>(['direct-invoke'])
const AWS_SAM_DEBUG_TARGET_TYPES = new Set<string>(['template', 'code'])

export class AwsSamDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    public constructor(private readonly cftRegistry = CloudFormationTemplateRegistry.getRegistry()) {}

    public async provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration[] | undefined> {
        if (folder) {
            const debugConfigurations: AwsSamDebuggerConfiguration[] = []
            const folderPath = folder.uri.fsPath
            const templates = this.cftRegistry.registeredTemplates

            for (const templateDatum of templates) {
                if (templateDatum.path.startsWith(folderPath) && templateDatum.template.Resources) {
                    for (const resourceKey of Object.keys(templateDatum.template.Resources)) {
                        const resource = templateDatum.template.Resources[resourceKey]
                        if (resource) {
                            debugConfigurations.push(
                                createSamDebugConfigurationFromTemplate(resourceKey, templateDatum.path, resource)
                            )
                        }
                    }
                }
            }

            return debugConfigurations
        }
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

function createSamDebugConfigurationFromTemplate(
    resourceName: string,
    templatePath: string,
    resource: CloudFormation.Resource
): AwsSamDebuggerConfiguration {
    return {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: resourceName,
        invokeTarget: {
            target: TEMPLATE_TARGET_TYPE,
            samTemplatePath: templatePath,
            samTemplateResource: resourceName
        }
    }
}
