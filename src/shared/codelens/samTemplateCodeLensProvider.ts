/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import { TemplateFunctionResource, TemplateSymbolResolver } from '../cloudformation/templateSymbolResolver'
import { getReferencedTemplateResources, LaunchConfiguration } from '../debug/launchConfiguration'
import { TEMPLATE_TARGET_TYPE, API_TARGET_TYPE } from '../sam/debugger/awsSamDebugConfiguration'
import { AddSamDebugConfigurationInput } from '../sam/debugger/commands/addSamDebugConfiguration'
import { localize } from '../utilities/vsCodeUtils'

/**
 * Provides Code Lenses for generating debug configurations for SAM templates.
 */
export class SamTemplateCodeLensProvider implements vscode.CodeLensProvider {
    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        symbolResolver = new TemplateSymbolResolver(document),
        launchConfig = new LaunchConfiguration(document.uri)
    ): Promise<vscode.CodeLens[]> {
        const functionResources = (await symbolResolver.getResourcesOfKind('function')) ?? []
        const apiResources = (await symbolResolver.getResourcesOfKind('api')) ?? []
        if (_(functionResources).isEmpty() && _(apiResources).isEmpty()) {
            return []
        }

        // User already has launch configs for these:
        const existingConfigs = getReferencedTemplateResources(launchConfig)

        return _([...functionResources, ...apiResources])
            .reject(r => existingConfigs.has(r.name))
            .map(r => this.createCodeLens(r, document.uri))
            .value()
    }

    private createCodeLens(resource: TemplateFunctionResource, templateUri: vscode.Uri): vscode.CodeLens {
        const target = resource.kind === 'api' ? API_TARGET_TYPE : TEMPLATE_TARGET_TYPE
        const input: AddSamDebugConfigurationInput = {
            resourceName: resource.name,
            rootUri: templateUri,
        }
        return new vscode.CodeLens(resource.range, {
            title: localize('AWS.command.addSamDebugConfiguration', 'Add Debug Configuration'),
            command: 'aws.addSamDebugConfiguration',
            arguments: [input, target],
        })
    }
}
