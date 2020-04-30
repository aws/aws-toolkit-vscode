/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getCodeRoot, getHandlerName, getTemplateResource } from '../../../lambda/local/debugConfiguration'
import { getDefaultRuntime, getFamily, getRuntimeFamily, RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
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
import {
    AwsSamDebuggerConfiguration,
    AWS_SAM_DEBUG_TYPE,
    createTemplateAwsSamDebugConfig,
} from './awsSamDebugConfiguration'
import { TemplateTargetProperties } from './awsSamDebugConfiguration.gen'
import {
    AwsSamDebugConfigurationValidator,
    DefaultAwsSamDebugConfigurationValidator,
} from './awsSamDebugConfigurationValidator'
import { SamLaunchRequestArgs } from './samDebugSession'

const localize = nls.loadMessageBundle()

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
                    if (!templateDatum.template.Resources) {
                        getLogger().error(`provideDebugConfigurations: invalid template: ${templateDatum.path}`)
                        continue
                    }
                    const resources = getResourcesFromTemplateDatum(templateDatum)
                    for (const resourceKey of resources.keys()) {
                        configs.push(createTemplateAwsSamDebugConfig(resourceKey, templateDatum.path))
                    }
                }
            }
            getLogger().verbose(`provideDebugConfigurations: debugconfigs: ${JSON.stringify(configs)}`)
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
        if (!folder) {
            getLogger().error(`SAM debug: no workspace folder`)
            vscode.window.showErrorMessage(
                localize('AWS.sam.debugger.noWorkspace', 'AWS SAM debug: choose a workspace, then try again')
            )
            return undefined
        }
        const cftRegistry = CloudFormationTemplateRegistry.getRegistry()

        // If "request" field is missing this means launch.json does not exist.
        // User/vscode expects us to dynamically decide defaults if possible.
        const hasLaunchJson = !!config.request
        const configValidator: AwsSamDebugConfigurationValidator = new DefaultAwsSamDebugConfigurationValidator(
            cftRegistry,
            folder
        )

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
            getLogger().verbose(`SAM debug: generated config (no launch.json): ${JSON.stringify(config)}`)
        } else {
            const rv = configValidator.validate(config)
            if (!rv.isValid) {
                getLogger().error(`SAM debug: invalid config: ${rv.message!!}`)
                vscode.window.showErrorMessage(rv.message!!)
                return undefined
            } else if (rv.message) {
                vscode.window.showInformationMessage(rv.message)
            }
            getLogger().verbose(`SAM debug: config: ${JSON.stringify(config.name)}`)
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
            getDefaultRuntime(getRuntimeFamily(editor?.document?.languageId ?? 'unknown'))

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

        let launchConfig: SamLaunchRequestArgs = {
            ...config,
            request: 'attach',
            codeRoot: codeRoot ?? '',
            workspaceFolder: folder,
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
            case RuntimeFamily.NodeJS: {
                // Make a NodeJS launch-config from the generic config.
                launchConfig = await tsDebug.makeTypescriptConfig(launchConfig)
                break
            }
            case RuntimeFamily.Python: {
                // Make a Python launch-config from the generic config.
                launchConfig = await pythonDebug.makePythonDebugConfig(
                    launchConfig,
                    !launchConfig.noDebug,
                    launchConfig.runtime,
                    launchConfig.handlerName
                )
                break
            }
            case RuntimeFamily.DotNetCore: {
                // Make a DotNet launch-config from the generic config.
                launchConfig = await csharpDebug.makeCsharpConfig(launchConfig)
                break
            }
            default: {
                getLogger().error(`SAM debug: unknown runtime: ${runtime})`)
                vscode.window.showErrorMessage(
                    localize('AWS.sam.debugger.invalidRuntime', 'AWS SAM debug: unknown runtime: {0}', runtime)
                )
                return undefined
            }
        }

        // Set the type, then vscode will pass the config to SamDebugSession.attachRequest().
        // (Registered in sam/activation.ts which calls registerDebugAdapterDescriptorFactory()).
        // By this point launchConfig.request is now set to "attach" (not "direct-invoke").
        launchConfig.type = AWS_SAM_DEBUG_TYPE

        if (launchConfig.request !== 'attach') {
            // The "request" field must be updated so that it routes to the
            // DebugAdapter (SamDebugSession.attachRequest()), else this will
            // just cycle back (and it indicates a bug in the config logic).
            throw Error(
                `resolveDebugConfiguration: launchConfig was not correctly resolved before return: ${JSON.stringify(
                    launchConfig
                )}`
            )
        }

        return launchConfig
    }
}
