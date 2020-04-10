/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import { TemplateFunctionResource, TemplateSymbolResolver } from '../cloudformation/templateSymbolResolver'
import { LaunchConfiguration } from '../debug/launchConfiguration'
import { isTemplateTargetProperties, TemplateTargetProperties } from '../sam/debugger/awsSamDebugConfiguration'
import { AddSamDebugConfigurationInput } from '../sam/debugger/commands/addSamDebugConfiguration'
import { localize } from '../utilities/vsCodeUtils'
import * as pathutils from '../utilities/pathUtils'

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
        const functionResources = await symbolResolver.getFunctionResources()
        if (_(functionResources).isEmpty()) {
            return []
        }

        const existingDebuggedResources = getExistingDebuggedResources(document.uri, launchConfig)

        return _(functionResources)
            .reject(functionResource => existingDebuggedResources.has(functionResource.name))
            .map(functionResource => this.createCodeLens(functionResource, document.uri))
            .value()
    }

    private createCodeLens(functionResource: TemplateFunctionResource, templateUri: vscode.Uri): vscode.CodeLens {
        const input: AddSamDebugConfigurationInput = {
            resourceName: functionResource.name,
            templateUri: templateUri,
        }

        return new vscode.CodeLens(functionResource.range, {
            title: localize('AWS.command.addSamDebugConfiguration', 'Add Debug Configuration'),
            command: 'aws.addSamDebugConfiguration',
            arguments: [input],
        })
    }
}

function getExistingDebuggedResources(templateUri: vscode.Uri, launchConfig: LaunchConfiguration): Set<string> {
    const existingSamDebugTargets = getExistingSamDebugTargets(launchConfig)

    return _(existingSamDebugTargets)
        .filter(target => pathutils.normalize(target.samTemplatePath) === pathutils.normalize(templateUri.fsPath))
        .map(target => target.samTemplateResource)
        .thru(array => new Set(array))
        .value()
}

function getExistingSamDebugTargets(launchConfig: LaunchConfiguration): TemplateTargetProperties[] {
    return _(launchConfig.getSamDebugConfigurations())
        .map(samConfig => samConfig.invokeTarget)
        .filter(isTemplateTargetProperties)
        .value()
}
