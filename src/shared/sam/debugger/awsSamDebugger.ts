/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { getDefaultRuntime, NodejsDebugConfiguration, PythonDebugConfiguration } from '../../../lambda/local/debugConfiguration';
import { getFamily, RuntimeFamily, samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime';
import { invokeLambdaFunction } from '../../../shared/codelens/localLambdaRunner';
import { CloudFormation } from '../../cloudformation/cloudformation';
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry';
import * as pythonDebug from '../../codelens/pythonCodeLensProvider';
import * as tsDebug from '../../codelens/typescriptCodeLensProvider';
import * as csharpDebug from '../../codelens/csharpCodeLensProvider';
import { ExtContext } from '../../extensions';
import { isInDirectory } from '../../filesystemUtilities';
import { getLogger } from '../../logger';
import { getStartPort } from '../../utilities/debuggerUtils';
import { AwsSamDebuggerConfiguration } from './awsSamDebugConfiguration';
import { SamLaunchRequestArgs } from './samDebugSession';
import { tryGetAbsolutePath } from '../../utilities/workspaceUtils';

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
    public constructor(readonly ctx:ExtContext) {}

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
        const cftRegistry = CloudFormationTemplateRegistry.getRegistry()

        // If "request" field is missing this means launch.json does not exist.
        // User/vscode expects us to dynamically decide defaults if possible.
        const hasLaunchJson = !!config.request

        if (!hasLaunchJson) {
            // Try to generate a default config dynamically.
            const configs: AwsSamDebuggerConfiguration[] | undefined =
                await this.provideDebugConfigurations(folder, token)
            if (!configs || configs.length === 0) {
                getLogger().error(`SAM debug: failed to generate config (found CFN templates: ${cftRegistry.registeredTemplates.length})`)
                if (cftRegistry.registeredTemplates.length > 0) {
                    vscode.window.showErrorMessage(localize('AWS.sam.debugger.noTemplates', 'No SAM templates found in workspace'))
                } else {
                    vscode.window.showErrorMessage(localize('AWS.sam.debugger.failedLaunch', 'AWS SAM failed to launch. Try creating launch.json'))
                }
                return undefined
            }
            config = {
                ...config,
                ...configs[0],
            }
            getLogger().info(`SAM debug: generated config (no launch.json): ${JSON.stringify(config)}`)
        } else if (!validateConfig(folder, config)) {
            getLogger().warn(`SAM debug: invalid config: ${config.name}`)
            return undefined  // validateConfig already showed appropriate message.
        } else {
            getLogger().info(`SAM debug: config: ${JSON.stringify(config.name)}`)
        }

        // generate debugconfig
        // SAM build
        // SAM invoke

        const editor = vscode.window.activeTextEditor;
        const fullpath = tryGetAbsolutePath(folder, config.invokeTarget.samTemplatePath!!)
        const cfnTemplate = cftRegistry.getRegisteredTemplate(fullpath)?.template
        // Normalize to absolute path for use in the runner.
        config.invokeTarget.samTemplatePath = fullpath
        const resource: CloudFormation.Resource | undefined = cfnTemplate?.Resources![config.invokeTarget.samTemplateResource!!]
        const handlerName: string = config.invokeTarget.lambdaHandler ?? resource?.Properties?.Handler!!

        let runtime: string|undefined = config.lambda?.runtime
            ?? resource?.Properties?.Runtime
            ?? getDefaultRuntime(editor?.document?.languageId ?? 'unknown')

        if (!runtime) {
            getLogger().error(`SAM debug: failed to launch config: ${config})`)
            vscode.window.showErrorMessage(localize('AWS.sam.debugger.failedLaunch', 'AWS SAM failed to launch. Try creating launch.json'))
            return undefined
        }

        const runtimeFamily = getFamily(runtime)
        const documentUri = vscode.window.activeTextEditor?.document.uri
            // XXX: don't know what URI to choose...
            ?? vscode.Uri.parse(config.invokeTarget.samTemplatePath!!)
        const workspaceFolder = folder
            // XXX: when/why is workspace undefined?
            ?? vscode.workspace.getWorkspaceFolder(documentUri)!!
        const launchConfig: SamLaunchRequestArgs = {
            ...config,
            request: 'attach',
            samProjectCodeRoot: '',
            workspaceFolder: workspaceFolder,
            runtime: runtime,
            runtimeFamily: runtimeFamily,
            handlerName: handlerName,
            originalHandlerName: handlerName,
            documentUri: documentUri,
            samTemplatePath: config.invokeTarget.samTemplatePath!!,
            originalSamTemplatePath: config.invokeTarget.samTemplatePath!!,
            debugPort: config.noDebug ? -1 : await getStartPort(),
        }

        if (runtimeFamily === RuntimeFamily.NodeJS) {
            await this.launchTypescript(launchConfig)
        } else if (runtimeFamily === RuntimeFamily.Python) {
            await this.launchPython(launchConfig)
        } else if (runtimeFamily === RuntimeFamily.DotNetCore) {
            launchConfig.type = 'coreclr'
            // XXX: not used for dotnet codepath (yet)?
            launchConfig.samProjectCodeRoot = await csharpDebug.getSamProjectDirPathForFile(config.documentUri.fsPath)
            await this.launchDotnet(launchConfig)
        }

        if (launchConfig.type === AWS_SAM_DEBUG_TYPE || launchConfig.request === DIRECT_INVOKE_TYPE) {
            // The "type" and "request" fields must be updated to non-AWS
            // values, otherwise this will just cycle back (and it indicates a
            // bug in the logic).
            throw Error(`resolveDebugConfiguration: launchConfig was not correctly resolved before return: ${launchConfig}`)
        }

        // XXX: return undefined, because we already launched and invoked by now.
        //
        // TODO: In the future we may consider NOT launching, and instead do one of the following:
        //  - return a config here for vscode to handle
        //  - return a config here for SamDebugSession.ts to handle (custom debug adapter)
        return undefined
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
    public async launchTypescript(config: SamLaunchRequestArgs) {
        config.type = 'node'
        config.samProjectCodeRoot = await tsDebug.getSamProjectDirPathForFile(config.documentUri.fsPath)

        //  Make a python launch-config from the generic config.
        const nodejsLaunchConfig: NodejsDebugConfiguration = {
            ...config,  // Compose.
            runtimeFamily: RuntimeFamily.NodeJS,
            name: 'SamLocalDebug',
            preLaunchTask: undefined,
            address: 'localhost',
            port: config.debugPort!!,
            localRoot: config.samProjectCodeRoot,
            remoteRoot: '/var/task',
            protocol: 'inspector',
            skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
        }

        await invokeLambdaFunction(this.ctx, nodejsLaunchConfig)
    }

    /**
     * Launches a dotnet ("coreclr") lambda:
     *
     * 1. prepares a bunch of arguments
     * 2. does `sam build`
     * 3. does `sam local invoke`
     *
     * @param config  Launch-config generated by resolveDebugConfiguration()
     * from a debug-config.
     */
    public async launchDotnet(config: SamLaunchRequestArgs) {
    }

    /**
     * Launches a Python lambda:
     *
     * 1. prepares a bunch of arguments
     * 2. does `sam build`
     * 3. does `sam local invoke`
     *
     * @param config  Launch-config generated by resolveDebugConfiguration()
     * from a debug-config.
     */
    public async launchPython(config: SamLaunchRequestArgs) {
        config.type = 'python'
        config.samProjectCodeRoot = await pythonDebug.getSamProjectDirPathForFile(config.documentUri.fsPath)

        //  Make a Python launch-config from the generic config.
        const launchConfig: PythonDebugConfiguration = {
            ...config,  // Compose
            ...await pythonDebug.makePythonDebugConfig(
                !config.noDebug,
                config.workspaceFolder,
                config.samProjectCodeRoot,
                config.runtime,
                config.handlerName,
                config.documentUri,
                config.samTemplatePath!!
            ),
        }

        await pythonDebug.invokePythonLambda(this.ctx, launchConfig)
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
    if (!config.request) {
        rv.message = localize(
            'AWS.sam.debugger.missingField',
            'Missing required field "{0}" in debug config',
            'request'
        )
    } else if (!AWS_SAM_DEBUG_REQUEST_TYPES.includes(config.request)) {
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
            const fullpath = tryGetAbsolutePath(folder, config.invokeTarget.samTemplatePath)
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
