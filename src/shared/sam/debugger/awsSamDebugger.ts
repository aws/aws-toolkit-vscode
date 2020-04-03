/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { CloudFormation } from '../../cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry'
import { isContainedWithinDirectory } from '../../filesystemUtilities'
import { AwsSamDebuggerConfiguration, TemplateTargetProperties } from './awsSamDebugConfiguration'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam'
export const DIRECT_INVOKE_TYPE = 'direct-invoke'
export const TEMPLATE_TARGET_TYPE: 'template' = 'template'
export const CODE_TARGET_TYPE: 'code' = 'code'

const AWS_SAM_DEBUG_REQUEST_TYPES = [DIRECT_INVOKE_TYPE]
const AWS_SAM_DEBUG_TARGET_TYPES = [TEMPLATE_TARGET_TYPE, CODE_TARGET_TYPE]

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
                if (isContainedWithinDirectory(folderPath, templateDatum.path) && templateDatum.template.Resources) {
                    for (const resourceKey of Object.keys(templateDatum.template.Resources)) {
                        const resource = templateDatum.template.Resources[resourceKey]
                        if (resource) {
                            debugConfigurations.push(
                                createDirectInvokeSamDebugConfigurationFromTemplate(resourceKey, templateDatum.path)
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
        let validityPair: { isValid: boolean; message?: string } = generalDebugConfigValidation(debugConfiguration)

        if (!validityPair.isValid) {
            if (validityPair.message) {
                vscode.window.showErrorMessage(validityPair.message)
            }

            return undefined
        }

        if (debugConfiguration.invokeTarget.target === TEMPLATE_TARGET_TYPE) {
            validityPair = templateDebugConfigValidation(debugConfiguration, this.cftRegistry)
        } else if (debugConfiguration.invokeTarget.target === CODE_TARGET_TYPE) {
            validityPair = codeDebugConfigValidation(debugConfiguration)
        }

        if (!validityPair.isValid) {
            if (validityPair.message) {
                vscode.window.showErrorMessage(validityPair.message)
            }

            return undefined
        } else if (validityPair.message) {
            vscode.window.showInformationMessage(validityPair.message)
        }

        vscode.window.showInformationMessage(localize('AWS.generic.notImplemented', 'Not implemented'))

        return undefined
    }
}

function createDirectInvokeSamDebugConfigurationFromTemplate(
    resourceName: string,
    templatePath: string
): AwsSamDebuggerConfiguration {
    return {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: resourceName,
        invokeTarget: {
            target: TEMPLATE_TARGET_TYPE,
            samTemplatePath: templatePath,
            samTemplateResource: resourceName,
        },
    }
}

function generalDebugConfigValidation(
    debugConfiguration: AwsSamDebuggerConfiguration
): { isValid: boolean; message?: string } {
    if (!AWS_SAM_DEBUG_REQUEST_TYPES.includes(debugConfiguration.request)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.invalidRequest',
                'Debug Configuration has an unsupported request type. Supported types: {0}',
                AWS_SAM_DEBUG_REQUEST_TYPES.join(', ')
            ),
        }
    }

    if (!AWS_SAM_DEBUG_TARGET_TYPES.includes(debugConfiguration.invokeTarget.target)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.invalidTarget',
                'Debug Configuration has an unsupported target type. Supported types: {0}',
                AWS_SAM_DEBUG_TARGET_TYPES.join(', ')
            ),
        }
    }

    return { isValid: true }
}

function templateDebugConfigValidation(
    debugConfiguration: AwsSamDebuggerConfiguration,
    cftRegistry: CloudFormationTemplateRegistry
): { isValid: boolean; message?: string } {
    const templateTarget = debugConfiguration.invokeTarget as TemplateTargetProperties

    const template = cftRegistry.getRegisteredTemplate(templateTarget.samTemplatePath)

    if (!template) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingTemplate',
                'Unable to find the Template file {0}',
                templateTarget.samTemplatePath
            ),
        }
    }

    const resources = template.template.Resources

    if (!resources || !Object.keys(resources).includes(templateTarget.samTemplateResource)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingResource',
                'Unable to find the Template Resource {0} in Template file {1}',
                templateTarget.samTemplateResource,
                templateTarget.samTemplatePath
            ),
        }
    }

    const resource = resources[templateTarget.samTemplateResource]

    // TODO: Validate against `AWS::Lambda::Function`?
    if (resource?.Type !== CloudFormation.SERVERLESS_FUNCTION_TYPE) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.resourceNotAFunction',
                'Template Resource {0} in Template file {1} needs to be of type {2}',
                templateTarget.samTemplateResource,
                templateTarget.samTemplatePath,
                CloudFormation.SERVERLESS_FUNCTION_TYPE
            ),
        }
    }

    if (!resource?.Properties?.Runtime || !samLambdaRuntimes.has(resource?.Properties?.Runtime as string)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.unsupportedRuntime',
                'Runtime for Template Resource {0} in Template file {1} is either undefined or unsupported.',
                templateTarget.samTemplateResource,
                templateTarget.samTemplatePath
            ),
        }
    }

    const templateEnv = resource?.Properties.Environment
    if (templateEnv?.Variables) {
        const templateEnvVars = Object.keys(templateEnv.Variables)
        const missingVars: string[] = []
        if (debugConfiguration.lambda && debugConfiguration.lambda.environmentVariables) {
            for (const key of Object.keys(debugConfiguration.lambda.environmentVariables)) {
                if (!templateEnvVars.includes(key)) {
                    missingVars.push(key)
                }
            }
        }
        if (missingVars.length > 0) {
            // this check doesn't affect template validity.
            return {
                isValid: true,
                message: localize(
                    'AWS.sam.debugger.extraEnvVars',
                    'The following environment variables are not found in the targeted template and will not be overridden: {0}',
                    missingVars.join(', ')
                ),
            }
        }
    }

    return { isValid: true }
}

function codeDebugConfigValidation(
    debugConfiguration: AwsSamDebuggerConfiguration
): { isValid: boolean; message?: string } {
    if (!debugConfiguration.lambda?.runtime || !samLambdaRuntimes.has(debugConfiguration.lambda.runtime)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingRuntime',
                'Debug Configurations with an invoke target of "{0}" require a valid Lambda runtime value, expected one of [{1}]',
                CODE_TARGET_TYPE,
                Array.from(samLambdaRuntimes).join(', ')
            ),
        }
    }

    return { isValid: true }
}
