/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import {
    AWS_SAM_DEBUG_TARGET_TYPES,
    AWS_SAM_DEBUG_TYPE,
    CODE_TARGET_TYPE,
    DIRECT_INVOKE_TYPE,
    getCodeRoot,
    getDefaultRuntime,
    getHandlerName,
    getTemplateResource,
    NodejsDebugConfiguration,
    PythonDebugConfiguration,
    TEMPLATE_TARGET_TYPE,
} from '../../../lambda/local/debugConfiguration'
import { getFamily, RuntimeFamily, samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { CloudFormation } from '../../cloudformation/cloudformation'
import { CloudFormationTemplateRegistry, getResourcesFromTemplateDatum } from '../../cloudformation/templateRegistry'
import * as csharpDebug from '../../codelens/csharpCodeLensProvider'
import * as pythonDebug from '../../codelens/pythonCodeLensProvider'
import * as tsDebug from '../../codelens/typescriptCodeLensProvider'
import { ExtContext } from '../../extensions'
import { isInDirectory } from '../../filesystemUtilities'
import { getLogger } from '../../logger'
import { getStartPort } from '../../utilities/debuggerUtils'
import * as pathutil from '../../utilities/pathUtils'
import { tryGetAbsolutePath } from '../../utilities/workspaceUtils'
import { AwsSamDebuggerConfiguration, ReadonlyJsonObject } from './awsSamDebugConfiguration'
import { TemplateTargetProperties } from './awsSamDebugConfiguration.gen'
import { SamLaunchRequestArgs } from './samDebugSession'

const localize = nls.loadMessageBundle()

const AWS_SAM_DEBUG_REQUEST_TYPES = [DIRECT_INVOKE_TYPE]

/**
 * `DebugConfigurationProvider` dynamically defines these aspects of a VSCode debugger:
 * - Initial debug configurations (for newly-created launch.json)
 * - To resolve a launch configuration before it is used to start a new
 *   debug session.
 *   Two "resolve" methods exist:
 *   - resolveDebugConfiguration: called before variables are substituted in
 *     the launch configuration.
 *   - resolveDebugConfigurationWithSubstitutedVariables: called after all
 *     variables have been substituted.
 *
 * https://code.visualstudio.com/api/extension-guides/debugger-extension#using-a-debugconfigurationprovider
 */
export class SamDebugConfigProvider implements vscode.DebugConfigurationProvider {
    public constructor(readonly ctx: ExtContext) {}

    /**
     * @param folder  Workspace folder
     * @param token  Cancellation token
     */
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
            const folderPath = folder.uri.fsPath
            const templates = cftRegistry.registeredTemplates

            for (const templateDatum of templates) {
                if (isInDirectory(folderPath, templateDatum.path)) {
                    const resources = getResourcesFromTemplateDatum(templateDatum)
                    for (const resourceKey of resources.keys()) {
                        configs.push(createDirectInvokeSamDebugConfiguration(resourceKey, templateDatum.path))
                    }
                }
            }
            getLogger().verbose(`provideDebugConfigurations: debugconfigs: ${configs}`)
        }

        return configs
    }

    /**
     * Generates a launch-config from a user-provided debug-config, then launches it.
     *
     * - "Launch" means `sam build` followed by `sam local invoke`.
     * - If launch.json is missing, this function attempts to generate a
     *   debug-config dynamically.
     *
     * @param folder  Workspace folder
     * @param config User-provided config (from launch.json)
     * @param token  Cancellation token
     */
    public async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<SamLaunchRequestArgs | undefined> {
        if (token?.isCancellationRequested) {
            return undefined
        }
        /**
         * XXX: Temporary magic field for testing.
         * 1. Disables the EXECUTE phase.
         * 2. Returns the config.
         */
        const noInvoke = !!config.__noInvoke
        const cftRegistry = CloudFormationTemplateRegistry.getRegistry()

        // If "request" field is missing this means launch.json does not exist.
        // User/vscode expects us to dynamically decide defaults if possible.
        const hasLaunchJson = !!config.request

        if (!hasLaunchJson) {
            // Try to generate a default config dynamically.
            const configs: AwsSamDebuggerConfiguration[] | undefined = await this.provideDebugConfigurations(
                folder,
                token
            )

            if (!configs || configs.length === 0) {
                getLogger().error(
                    `SAM debug: failed to generate config (found CFN templates: ${cftRegistry.registeredTemplates.length})`
                )
                if (cftRegistry.registeredTemplates.length > 0) {
                    vscode.window.showErrorMessage(
                        localize('AWS.sam.debugger.noTemplates', 'No SAM templates found in workspace')
                    )
                } else {
                    vscode.window.showErrorMessage(
                        localize('AWS.sam.debugger.failedLaunch', 'AWS SAM failed to launch. Try creating launch.json')
                    )
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
            return undefined // validateConfig already showed appropriate message.
        } else {
            getLogger().info(`SAM debug: config: ${JSON.stringify(config.name)}`)
        }

        const editor = vscode.window.activeTextEditor
        const templateInvoke = config.invokeTarget as TemplateTargetProperties
        const templateResource = getTemplateResource(config)
        const codeRoot = getCodeRoot(folder, config)
        const handlerName = getHandlerName(config)

        if (templateInvoke?.samTemplatePath) {
            // Normalize to absolute path.
            // TODO: If path is relative, it is relative to launch.json (i.e. .vscode directory).
            templateInvoke.samTemplatePath = pathutil.normalize(
                tryGetAbsolutePath(folder, templateInvoke.samTemplatePath)
            )
        }

        const runtime: string | undefined =
            config.lambda?.runtime ??
            templateResource?.Properties?.Runtime ??
            getDefaultRuntime(editor?.document?.languageId ?? 'unknown')

        if (!runtime) {
            getLogger().error(`SAM debug: failed to launch config: ${config})`)
            vscode.window.showErrorMessage(
                localize('AWS.sam.debugger.failedLaunch', 'AWS SAM failed to launch. Try creating launch.json')
            )
            return undefined
        }

        const runtimeFamily = getFamily(runtime)
        const documentUri =
            vscode.window.activeTextEditor?.document.uri ??
            // XXX: don't know what URI to choose...
            vscode.Uri.parse(templateInvoke.samTemplatePath!!)
        const workspaceFolder =
            folder ??
            // XXX: when/why is `folder` undefined?
            vscode.workspace.getWorkspaceFolder(documentUri)!!

        let launchConfig: SamLaunchRequestArgs = {
            ...config,
            request: 'attach',
            codeRoot: codeRoot ?? '',
            workspaceFolder: workspaceFolder,
            runtime: runtime,
            runtimeFamily: runtimeFamily,
            handlerName: handlerName,
            originalHandlerName: handlerName,
            documentUri: documentUri,
            samTemplatePath: pathutil.normalize(templateInvoke?.samTemplatePath),
            originalSamTemplatePath: pathutil.normalize(templateInvoke?.samTemplatePath),
            debugPort: config.noDebug ? -1 : await getStartPort(),
        }

        //
        // Configure and launch.
        //
        // 1. prepare a bunch of arguments
        // 2. do `sam build`
        // 3. do `sam local invoke`
        //
        switch (runtimeFamily) {
            case RuntimeFamily.NodeJS:
                {
                    const c: NodejsDebugConfiguration = await tsDebug.makeTypescriptConfig(launchConfig)
                    launchConfig = c
                    if (!noInvoke) {
                        await tsDebug.invokeTypescriptLambda(this.ctx, c)
                    }
                }
                break
            case RuntimeFamily.Python: {
                //  Make a Python launch-config from the generic config.
                const c: PythonDebugConfiguration = await pythonDebug.makePythonDebugConfig(
                    launchConfig,
                    !launchConfig.noDebug,
                    launchConfig.runtime,
                    launchConfig.handlerName
                )
                launchConfig = c
                if (!noInvoke) {
                    await pythonDebug.invokePythonLambda(this.ctx, c)
                }
                break
            }
            case RuntimeFamily.DotNetCore: {
                const c = await csharpDebug.makeCsharpConfig(launchConfig)
                launchConfig = c
                if (!noInvoke) {
                    await csharpDebug.invokeCsharpLambda(this.ctx, c)
                }
                break
            }
            default:
                throw Error('unknown RuntimeFamily')
        }

        if (launchConfig.type === AWS_SAM_DEBUG_TYPE || launchConfig.request === DIRECT_INVOKE_TYPE) {
            // The "type" and "request" fields must be updated to non-AWS
            // values, otherwise this will just cycle back (and it indicates a
            // bug in the logic).
            throw Error(
                `resolveDebugConfiguration: launchConfig was not correctly resolved before return: ${launchConfig}`
            )
        }

        // XXX: return undefined, because we already launched and invoked by now.
        //
        // TODO: In the future we may consider NOT launching, and instead do one of the following:
        //  - return a config here for vscode to handle
        //  - return a config here for SamDebugSession.ts to handle (custom debug adapter)
        if (!noInvoke) {
            return undefined
        }
        return launchConfig
    }
}

export function createDirectInvokeSamDebugConfiguration(
    resourceName: string,
    templatePath: string,
    additionalFields?: {
        eventJson?: ReadonlyJsonObject
        environmentVariables?: ReadonlyJsonObject
        dockerNetwork?: string
        useContainer?: boolean
    }
): AwsSamDebuggerConfiguration {
    let response: AwsSamDebuggerConfiguration = {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: resourceName,
        invokeTarget: {
            target: TEMPLATE_TARGET_TYPE,
            samTemplatePath: templatePath,
            samTemplateResource: resourceName,
        },
    }

    if (additionalFields) {
        response = {
            ...response,
            lambda: {
                event: {
                    json: additionalFields.eventJson,
                },
                environmentVariables: additionalFields.environmentVariables,
            },
            sam: {
                dockerNetwork: additionalFields.dockerNetwork,
                containerBuild: additionalFields.useContainer,
            },
        }
    }

    return response
}
/**
 * Validates debug configuration properties.
 */
function validateConfig(folder: vscode.WorkspaceFolder | undefined, config: AwsSamDebuggerConfiguration): boolean {
    const cftRegistry = CloudFormationTemplateRegistry.getRegistry()

    let rv: { isValid: boolean; message?: string } = { isValid: false, message: undefined }
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
            AWS_SAM_DEBUG_REQUEST_TYPES.join(', ')
        )
    } else if (!AWS_SAM_DEBUG_TARGET_TYPES.includes(config.invokeTarget.target)) {
        rv.message = localize(
            'AWS.sam.debugger.invalidTarget',
            'Debug Configuration has an unsupported target type. Supported types: {0}',
            AWS_SAM_DEBUG_TARGET_TYPES.join(', ')
        )
    } else if (config.invokeTarget.target === TEMPLATE_TARGET_TYPE) {
        let cfnTemplate
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
    cfnTemplate: CloudFormation.Template | undefined
): { isValid: boolean; message?: string } {
    const templateTarget = config.invokeTarget as TemplateTargetProperties

    if (!cfnTemplatePath) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingField',
                'Missing required field "{0}" in debug config',
                'samTemplatePath'
            ),
        }
    }

    if (!cfnTemplate) {
        return {
            isValid: false,
            message: localize(
                'AWS.sam.debugger.missingTemplate',
                'Invalid (or missing) template file (path must be workspace-relative, or absolute): {0}',
                templateTarget.samTemplatePath
            ),
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
            ),
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
                ),
            }
        }
    }

    return { isValid: true }
}

function validateCodeConfig(debugConfiguration: AwsSamDebuggerConfiguration): { isValid: boolean; message?: string } {
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
