/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import { AddSamDebugConfigurationInput } from '../../lambda/commands/addSamDebugConfiguration'
import { TemplateFunctionResource, TemplateSymbolResolver } from '../cloudformation/templateSymbolResolver'
import { LaunchConfiguration } from '../debug/launchConfiguration'
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
        // tslint:disable-next-line: no-floating-promises
        this.emitClickTelemetry()

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

    private async emitClickTelemetry() {}

    private createCodeLens(functionResource: TemplateFunctionResource, templateUri: vscode.Uri) {
        const input: AddSamDebugConfigurationInput = {
            samTemplateResourceName: functionResource.name,
            samTemplateUri: templateUri
        }

        return new vscode.CodeLens(functionResource.range, {
            title: localize('AWS.command.addSamDebugConfiguration', 'Add Debug Config'),
            command: 'aws.addSamDebugConfiguration',
            arguments: [input]
        })
    }
}

function getExistingDebuggedResources(templateUri: vscode.Uri, launchConfig: LaunchConfiguration): Set<string> {
    const existingSamDebugConfigs = getExistingSamDebugConfigurations(templateUri, launchConfig)

    return _(existingSamDebugConfigs)
        .map(samConfig => samConfig.invokeTarget)
        .map(samConfig => samConfig.samTemplateResource)
        .compact()
        .thru(array => new Set(array))
        .value()
}

function getExistingSamDebugConfigurations(templateUri: vscode.Uri, launchConfig: LaunchConfiguration) {
    const debugConfigs = launchConfig.getSamDebugConfigurations()

    return debugConfigs.filter(config => config.invokeTarget.samTemplatePath === templateUri.fsPath)
}
