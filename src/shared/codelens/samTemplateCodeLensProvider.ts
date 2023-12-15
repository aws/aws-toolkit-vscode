/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash'
import * as vscode from 'vscode'
import { TemplateFunctionResource, TemplateSymbolResolver } from '../cloudformation/templateSymbolResolver'
import { getConfigsMappedToTemplates, LaunchConfiguration } from '../debug/launchConfiguration'
import { getIdeProperties } from '../extensionUtilities'
import { TEMPLATE_TARGET_TYPE, API_TARGET_TYPE } from '../sam/debugger/awsSamDebugConfiguration'
import { AddSamDebugConfigurationInput } from '../sam/debugger/commands/addSamDebugConfiguration'
import { localize } from '../utilities/vsCodeUtils'
import { SamCliSettings } from '../sam/cli/samCliSettings'

/**
 * Provides "Add Debug Configuration" CodeLenses to SAM template.yaml files,
 * for resources that do not already have a mapped config in launch.json.
 */
export class SamTemplateCodeLensProvider implements vscode.CodeLensProvider {
    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        symbolResolver = new TemplateSymbolResolver(document),
        launchConfig = new LaunchConfiguration(document.uri),
        waitForSymbols: boolean = false
    ): Promise<vscode.CodeLens[]> {
        const config = SamCliSettings.instance
        if (!config.get('enableCodeLenses', false)) {
            return []
        }
        const apiResources = await symbolResolver.getResourcesOfKind('api', waitForSymbols)
        const funResources = await symbolResolver.getResourcesOfKind('function', waitForSymbols)
        if (_(funResources).isEmpty() && _(apiResources).isEmpty()) {
            return []
        }

        // User already has launch configs for:
        const mappedApiConfigs = Array.from(await getConfigsMappedToTemplates(launchConfig, 'api'))
        const mappedFunConfigs = Array.from(await getConfigsMappedToTemplates(launchConfig, 'template'))

        const unmappedApis = apiResources.filter(
            r =>
                undefined ===
                mappedApiConfigs.find(
                    o => r.name === (o.invokeTarget as any).logicalId && o.invokeTarget.target === 'api'
                )
        )
        const unmappedFuns = funResources.filter(
            r =>
                undefined ===
                mappedFunConfigs.find(
                    o => r.name === (o.invokeTarget as any).logicalId && o.invokeTarget.target === 'template'
                )
        )
        const codelensInfo = [...unmappedApis, ...unmappedFuns].map(r => this.createCodeLens(r, document.uri))
        return codelensInfo
    }

    private createCodeLens(resource: TemplateFunctionResource, templateUri: vscode.Uri): vscode.CodeLens {
        const target = resource.kind === 'api' ? API_TARGET_TYPE : TEMPLATE_TARGET_TYPE
        const input: AddSamDebugConfigurationInput = {
            resourceName: resource.name,
            rootUri: templateUri,
        }
        const title =
            resource.kind === 'api'
                ? `${getIdeProperties().company}: ${localize(
                      'AWS.command.addSamApiDebugConfiguration',
                      'Add API Debug Configuration'
                  )}`
                : `${getIdeProperties().company}: ${localize(
                      'AWS.command.addSamDebugConfiguration',
                      'Add Debug Configuration'
                  )}`
        return new vscode.CodeLens(resource.range, {
            title: title,
            command: 'aws.addSamDebugConfiguration',
            arguments: [input, target],
        })
    }
}
