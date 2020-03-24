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
import { isInDirectory } from '../../filesystemUtilities'
import { AwsSamDebuggerInvokeTargetTemplateFields } from './awsSamDebugConfiguration'
import { AwsSamDebuggerConfiguration } from './awsSamDebugConfiguration.gen'
import { getLogger } from '../../logger'
import * as path from 'path'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam'
export const DIRECT_INVOKE_TYPE = 'direct-invoke'
export const TEMPLATE_TARGET_TYPE: 'template' = 'template'
export const CODE_TARGET_TYPE: 'code' = 'code'

const AWS_SAM_DEBUG_REQUEST_TYPES = [DIRECT_INVOKE_TYPE]
const AWS_SAM_DEBUG_TARGET_TYPES = [TEMPLATE_TARGET_TYPE, CODE_TARGET_TYPE]

/**
 * `DebugConfigurationProvider` dynamically defines these aspects of a VSCode debugger:
 *    - Initial debug configurations (for newly-created launch.json)
 *    - To resolve a launch configuration before it is used to start a new
 *      debug session.
 *      Two "resolve" methods exist:
 *      - resolveDebugConfiguration: called before variables are substituted in
 *        the launch configuration.
 *      - resolveDebugConfigurationWithSubstitutedVariables: called after all
 *        variables have been substituted.
 *
 * https://code.visualstudio.com/api/extension-guides/debugger-extension#using-a-debugconfigurationprovider
 */
export class SamDebugConfigProvider implements vscode.DebugConfigurationProvider {
    public constructor(private readonly cftRegistry = CloudFormationTemplateRegistry.getRegistry()) {}

    public async provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration[] | undefined> {
        const configs: AwsSamDebuggerConfiguration[] = []
        if (folder) {
            const templates = this.cftRegistry.registeredTemplates

            for (const template of templates) {
                if (isInDirectory(folder.uri.fsPath, template.path) && template.template.Resources) {
                    for (const resourceName of Object.keys(template.template.Resources)) {
                        const resource = template.template.Resources[resourceName]
                        if (resource) {
                            configs.push(
                                {
                                    type: AWS_SAM_DEBUG_TYPE,
                                    request: DIRECT_INVOKE_TYPE,
                                    name: resourceName,
                                    invokeTarget: {
                                        target: TEMPLATE_TARGET_TYPE,
                                        samTemplatePath: template.path,
                                        samTemplateResource: resourceName,
                                    },
                                }
                            )
                        }
                    }
                }
            }
            getLogger().verbose(`provideDebugConfigurations: debugconfigs: ${configs}`)
        }

        // Stub non-template ("code") lambda config.
        const config:AwsSamDebuggerConfiguration = {
            type: AWS_SAM_DEBUG_TYPE,
            request: DIRECT_INVOKE_TYPE,
            name: 'AWS SAM resource',
            invokeTarget: {
                target: CODE_TARGET_TYPE,
                // Magic: invokes getLambdaName() mapped in package.json.
                lambdaHandler: '${command:AskForLocalLambda}',
                // samTemplatePath: 'template.yaml',
                // samTemplateResource: "TemplateResource"
            },
            lambda: {
                runtime: 'nodejs12.x',
                timeoutSec: 30,
                memoryMb: 128,
                environmentVariables: {
                },
            },
        }
        configs.push(config)

        return configs
    }

    public async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration | undefined> {
        // Return initial (stub) config, if:
        //   1. launch.json is missing or empty (like "debuggers.*.initialConfigurations" in package.json)
        //   2. no template.yaml was discovered by provideDebugConfigurations()
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {  // && editor.document.languageId === 'markdown'
                // TODO: return stub? Should already have been done by resolveDebugConfiguration()...
            }
            return undefined
        }

        let validityPair: { isValid: boolean; message?: string } = validateConfig(config)
        if (!validityPair.isValid) {
            if (validityPair.message) {
                vscode.window.showErrorMessage(validityPair.message)
            }

            return undefined
        }

        if (config.invokeTarget.target === TEMPLATE_TARGET_TYPE) {
            const templateTarget = (config.invokeTarget as any) as AwsSamDebuggerInvokeTargetTemplateFields
            let cfnTemplate = undefined
            if (templateTarget.samTemplatePath) {
                const fullpath = path.resolve((
                    (folder?.uri) ? folder.uri.path + '/' : ''), templateTarget.samTemplatePath)
                // Normalize to absolute path for use in the runner.
                config.invokeTarget.samTemplatePath = fullpath
                cfnTemplate = this.cftRegistry.getRegisteredTemplate(fullpath)?.template
            }
            validityPair = validateTemplateConfig(config, templateTarget.samTemplatePath, cfnTemplate)
        } else if (config.invokeTarget.target === CODE_TARGET_TYPE) {
            validityPair = validateCodeConfig(config)
        }

        if (!validityPair.isValid) {
            if (validityPair.message) {
                vscode.window.showErrorMessage(validityPair.message)
            }

            return undefined
        } else if (validityPair.message) {
            vscode.window.showInformationMessage(validityPair.message)
        }

        getLogger().verbose(`validateTemplateConfig: resolved debug-config: ${config.name}`)
        config.request = 'launch'

        return config
    }
}

/**
 * Validates common debug configuration properties.
 */
function validateConfig(
    debugConfiguration: AwsSamDebuggerConfiguration
): { isValid: boolean; message?: string } {
    if (!AWS_SAM_DEBUG_REQUEST_TYPES.includes(debugConfiguration.request)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.invalidRequest',
                'Debug Configuration has an unsupported request type. Supported types: {0}',
                AWS_SAM_DEBUG_REQUEST_TYPES.join(', ')
            )
        }
    }

    if (!AWS_SAM_DEBUG_TARGET_TYPES.includes(debugConfiguration.invokeTarget.target)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.invalidTarget',
                'Debug Configuration has an unsupported target type. Supported types: {0}',
                AWS_SAM_DEBUG_TARGET_TYPES.join(', ')
            )
        }
    }

    return { isValid: true }
}

function validateTemplateConfig(
    config: AwsSamDebuggerConfiguration,
    cfnTemplatePath: string | undefined,
    cfnTemplate: CloudFormation.Template | undefined,
): { isValid: boolean; message?: string } {
    const templateTarget = (config.invokeTarget as any) as AwsSamDebuggerInvokeTargetTemplateFields
    
    if (!cfnTemplatePath) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingField',
                'Missing required field "{0}" in debug config',
                'samTemplatePath'
            )
        }
    }

    if (!cfnTemplate) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingTemplate',
                'Invalid (or missing) template file (path must be workspace-relative, or absolute): {0}',
                templateTarget.samTemplatePath
            )
        }
    }

    const resources = cfnTemplate.Resources

    if (!templateTarget.samTemplateResource) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingField',
                'Missing required field "{0}" in debug config',
                'samTemplateResource'
            )
        }
    }

    if (!resources || !Object.keys(resources).includes(templateTarget.samTemplateResource)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingResource',
                'Cannot find the template resource "{0}" in template file: {1}',
                templateTarget.samTemplateResource,
                templateTarget.samTemplatePath
            )
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
            )
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
            )
        }
    }

    const templateEnv = resource?.Properties.Environment
    if (templateEnv?.Variables) {
        const templateEnvVars = Object.keys(templateEnv.Variables)
        const missingVars: string[] = []
        if (config.lambda && config.lambda.environmentVariables) {
            for (const key of Object.keys(config.lambda.environmentVariables)) {
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
                )
            }
        }
    }

    return { isValid: true }
}

function validateCodeConfig(
    debugConfiguration: AwsSamDebuggerConfiguration
): { isValid: boolean; message?: string } {
    if (!debugConfiguration.lambda?.runtime || !samLambdaRuntimes.has(debugConfiguration.lambda.runtime)) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingRuntime',
                'Debug Configurations with an invoke target of "{0}" require a valid Lambda runtime value',
                CODE_TARGET_TYPE
            )
        }
    }

    return { isValid: true }
}
