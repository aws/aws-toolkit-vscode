/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { getFamily, RuntimeFamily, samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime';
import { invokeLambdaFunction } from '../../../shared/codelens/localLambdaRunner';
import { CloudFormation } from '../../cloudformation/cloudformation';
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry';
import * as tsLensProvider from '../../codelens/typescriptCodeLensProvider';
import { isInDirectory } from '../../filesystemUtilities';
import { getLogger } from '../../logger';
import { AwsSamDebuggerConfiguration } from './awsSamDebugConfiguration'
import { ExtContext } from '../../extensions';
import { SamLaunchRequestArgs } from './samDebugSession';
import { getStartPort } from '../../utilities/debuggerUtils';
import { NodejsDebugConfiguration } from '../../../lambda/local/debugConfiguration';

const localize = nls.loadMessageBundle()

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
    constructor(readonly ctx:ExtContext) {}

    public async provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration[] | undefined> {
        if (token?.isCancellationRequested) {
            return undefined
        }
        const cftRegistry = CloudFormationTemplateRegistry.getRegistry()
        
        const configs: AwsSamDebuggerConfiguration[] = []
        if (folder) {
            const templates = cftRegistry.registeredTemplates

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
        // TODO: generate config dynamically based on the current workspace.
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

    /**
     * Generates and launches a launch-config from a user-provided debug-config.
     */
    public async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<SamLaunchRequestArgs | undefined> {
        if (token?.isCancellationRequested) {
            return undefined
        }
        if (!validateConfig(folder, config)) {
            getLogger().warn(`SamDebugConfigProvider: invalid debug-config: ${config.name}`)
            return undefined  // validateConfig already showed appropriate message.
        }
        getLogger().verbose(`SamDebugConfigProvider: resolved debug-config: ${config.name}`)

        // generate debugconfig
        // SAM build
        // SAM invoke
        // TODO: support "code" (non-"template").

        const runtime = config.lambda?.runtime
            ?? CloudFormation.getRuntime(config.cfnTemplate!!.Resources!!)
        const runtimeFamily = getFamily(runtime)
        const handlerName = config.invokeTarget.lambdaHandler ?? config.invokeTarget.samTemplateResource!!
        const launchConfig: SamLaunchRequestArgs = {
            ...config,
            request: DIRECT_INVOKE_TYPE,
            runtime: runtime,
            runtimeFamily: runtimeFamily,
            handlerName: handlerName,
            originalHandlerName: handlerName,
            isDebug: true,  // TODO: get from ...?
            documentUri: vscode.window.activeTextEditor?.document.uri
                // XXX: don't know what URI to choose...
                ?? vscode.Uri.parse(config.invokeTarget.samTemplatePath!!),
            samTemplatePath: config.invokeTarget.samTemplatePath!!,
            originalSamTemplatePath: config.invokeTarget.samTemplatePath!!,
            debugPort: config.isDebug ? await getStartPort() : -1,
        }

        if (runtimeFamily === RuntimeFamily.NodeJS) {
            await this.launchTypescript(launchConfig)
        } else if (runtimeFamily === RuntimeFamily.Python) {
        } else if (runtimeFamily === RuntimeFamily.DotNetCore) {
        }

        return launchConfig
    }

    /**
     * Launches a NodeJs lambda:
     * 
     * 1. prepares a bunch of arguments
     * 2. does `sam build`
     * 3. does `sam local invoke`
     * 
     * @param config  Launch-config generated by resolveDebugConfiguration()
     * from a debug-config.
     */
    async launchTypescript(config: SamLaunchRequestArgs) {
        const samProjectCodeRoot = await tsLensProvider.getSamProjectDirPathForFile(config.documentUri.fsPath)

        const nodejsLaunchConfig: NodejsDebugConfiguration = {
            ...config,  // Make a nodejs launch-config from the generic launch-config.
            type: 'node',
            runtimeFamily: RuntimeFamily.NodeJS,
            request: 'attach',
            name: 'SamLocalDebug',
            preLaunchTask: undefined,
            address: 'localhost',
            port: config.debugPort,
            localRoot: samProjectCodeRoot,
            remoteRoot: '/var/task',
            protocol: 'inspector',
            skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
        }
        // const cfnTemplateUri = vscode.Uri.parse(config.invokeTarget.samTemplatePath!!)
        // const params:LambdaLocalInvokeParams = {
        //     uri: config.documentUri,
        //     handlerName: config.handlerName,
        //     isDebug: config.isDebug,  //!!args.noDebug,
        //     workspaceFolder: vscode.workspace.getWorkspaceFolder(cfnTemplateUri)!!,
        //     samTemplate: cfnTemplateUri,
        //     samTemplateResourceName: config.invokeTarget.samTemplateResource,
        // }

        await invokeLambdaFunction(this.ctx, nodejsLaunchConfig)
    }
}

/**
 * Validates debug configuration properties.
 */
function validateConfig(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration,
): boolean {
    const cftRegistry = CloudFormationTemplateRegistry.getRegistry()

    let rv: { isValid: boolean; message?: string } = { isValid: false, message: undefined, }
    if (!AWS_SAM_DEBUG_REQUEST_TYPES.includes(config.request)) {
        rv.message = localize(
            'AWS.sam.debugger.invalidRequest',
            'Debug Configuration has an unsupported request type. Supported types: {0}',
            AWS_SAM_DEBUG_REQUEST_TYPES.join(', '))
    } else if (!AWS_SAM_DEBUG_TARGET_TYPES.includes(config.invokeTarget.target)) {
        rv.message = localize(
            'AWS.sam.debugger.invalidTarget',
            'Debug Configuration has an unsupported target type. Supported types: {0}',
            AWS_SAM_DEBUG_TARGET_TYPES.join(', '))
    } else if (config.invokeTarget.target === TEMPLATE_TARGET_TYPE) {
        let cfnTemplate = undefined
        if (config.invokeTarget.samTemplatePath) {
            const fullpath = path.resolve((
                (folder?.uri) ? folder.uri.path + '/' : ''), config.invokeTarget.samTemplatePath)
            // Normalize to absolute path for use in the runner.
            config.invokeTarget.samTemplatePath = fullpath
            cfnTemplate = cftRegistry.getRegisteredTemplate(fullpath)?.template
        }
        rv = validateTemplateConfig(config, config.invokeTarget.samTemplatePath, cfnTemplate)
    } else if (config.invokeTarget.target === CODE_TARGET_TYPE) {
        rv = validateCodeConfig(config)
    }

    if (!rv.isValid) {
        vscode.window.showErrorMessage(rv.message ?? 'invalid debug-config')
    } else if (rv.message) {
        vscode.window.showInformationMessage(rv.message)
    }

    return rv.isValid
}

function validateTemplateConfig(
    config: AwsSamDebuggerConfiguration,
    cfnTemplatePath: string | undefined,
    cfnTemplate: CloudFormation.Template | undefined,
): { isValid: boolean; message?: string } {
    const templateTarget = config.invokeTarget
    
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
