/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry'

import { localize } from '../../utilities/vsCodeUtils'
import { AwsSamDebuggerConfiguration, createAwsSamDebugConfigurationForTemplate } from './awsSamDebugConfiguration'
import {
    AwsSamDebugConfigurationValidator,
    DefaultAwsSamDebugConfigurationValidator,
} from './awsSamDebugConfigurationValidator'
import { isInDirectory } from '../../filesystemUtilities'

export class AwsSamDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    public constructor(
        private readonly cftRegistry = CloudFormationTemplateRegistry.getRegistry(),
        private readonly validator: AwsSamDebugConfigurationValidator = new DefaultAwsSamDebugConfigurationValidator(
            cftRegistry
        )
    ) {}

    public async provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration[] | undefined> {
        if (folder) {
            const debugConfigurations: AwsSamDebuggerConfiguration[] = []
            const folderPath = folder.uri.fsPath
            const templates = this.cftRegistry.registeredTemplates

            for (const templateDatum of templates) {
                if (isInDirectory(folderPath, templateDatum.path) && templateDatum.template.Resources) {
                    for (const resourceKey of Object.keys(templateDatum.template.Resources)) {
                        const resource = templateDatum.template.Resources[resourceKey]
                        if (resource) {
                            debugConfigurations.push(
                                createAwsSamDebugConfigurationForTemplate(resourceKey, templateDatum.path)
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
        const validationResult = this.validator.validateSamDebugConfiguration(debugConfiguration)

        if (!validationResult.isValid) {
            if (validationResult.message) {
                vscode.window.showErrorMessage(validationResult.message)
            }

            return undefined
        }

        vscode.window.showInformationMessage(localize('AWS.generic.notImplemented', 'Not implemented'))

        return undefined
    }
}
