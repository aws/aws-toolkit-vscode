/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import { TemplateFunctionResource, TemplateSymbolResolver } from '../cloudformation/templateSymbolResolver'
import { getReferencedTemplateResources, LaunchConfiguration } from '../debug/launchConfiguration'
import { TEMPLATE_TARGET_TYPE } from '../sam/debugger/awsSamDebugConfiguration'
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
        const functionResources = await symbolResolver.getFunctionResources()
        if (_(functionResources).isEmpty()) {
            return []
        }

        const existingDebuggedResources = getReferencedTemplateResources(launchConfig)

        return _(functionResources)
            .reject(functionResource => existingDebuggedResources.has(functionResource.name))
            .map(functionResource => this.createCodeLens(functionResource, document.uri))
            .value()
    }

    private createCodeLens(functionResource: TemplateFunctionResource, templateUri: vscode.Uri): vscode.CodeLens {
        // TODO: Find a way to add `runtime` or `runtimeFamily` to this input for naming?
        const input: AddSamDebugConfigurationInput = {
            resourceName: functionResource.name,
            rootUri: templateUri,
        }

        return new vscode.CodeLens(functionResource.range, {
            title: localize('AWS.command.addSamDebugConfiguration', 'Add Debug Configuration'),
            command: 'aws.addSamDebugConfiguration',
            arguments: [input, TEMPLATE_TARGET_TYPE],
        })
    }
}
