/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as _ from 'lodash'
import * as nls from 'vscode-nls'
import { Runtime } from 'aws-sdk/clients/lambda'
import {
    getCodeRoot,
    getHandlerName,
    getTemplateResource,
    NodejsDebugConfiguration,
    PythonDebugConfiguration,
    getTemplate,
} from '../../../lambda/local/debugConfiguration'
import { getDefaultRuntime, getFamily, getRuntimeFamily, RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry'
import { Timeout } from '../../utilities/timeoutUtils'
import { ChannelLogger } from '../../utilities/vsCodeUtils'
import * as csharpDebug from './csharpSamDebug'
import * as pythonDebug from './pythonSamDebug'
import * as tsDebug from './typescriptSamDebug'
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
import { makeConfig } from '../localLambdaRunner'
import { SamLocalInvokeCommand } from '../cli/samCliLocalInvoke'
import { getCredentialsFromStore } from '../../../credentials/credentialsStore'
import { fromString } from '../../../credentials/providers/credentialsProviderId'
import { notifyUserInvalidCredentials } from '../../../credentials/credentialsUtilities'
import { Credentials } from 'aws-sdk/lib/credentials'
import { CloudFormation } from '../../cloudformation/cloudformation'

const localize = nls.loadMessageBundle()

/**
 * SAM-specific launch attributes (which are not part of the DAP).
 *
 * Schema for these attributes lives in package.json
 * ("configurationAttributes").
 *
 * @see AwsSamDebuggerConfiguration
 * @see AwsSamDebugConfigurationProvider.resolveDebugConfiguration
 */
export interface SamLaunchRequestArgs extends AwsSamDebuggerConfiguration {
    // readonly type: 'node' | 'python' | 'coreclr' | 'aws-sam'
    readonly request: 'attach' | 'launch' | 'direct-invoke'

    /** Runtime id-name passed to vscode to select a debugger/launcher. */
    runtime: Runtime
    runtimeFamily: RuntimeFamily
    /** Resolved (potentinally generated) handler name. This field is mutable and should adjust to whatever handler name is currently generated*/
    handlerName: string
    workspaceFolder: vscode.WorkspaceFolder

    /**
     * Absolute path to the SAM project root, calculated from any of:
     *  - `codeUri` in `template.yaml`
     *  - `projectRoot` for the case of `target=code`
     *  - provider-specific heuristic (last resort)
     */
    codeRoot: string
    outFilePath?: string

    /** Path to (generated) directory used as a working/staging area for SAM. */
    baseBuildDir?: string

    /**
     * URI of the current editor document.
     * Used as a last resort for deciding `codeRoot` (when there is no `launch.json` nor `template.yaml`)
     */
    documentUri: vscode.Uri

    /**
     * SAM/CFN template absolute path used for SAM CLI invoke.
     * - For `target=code` this is the _generated_ template path.
     * - For `target=template` this is the _generated_ template path (TODO: in
     *   the future we may change this to be the template found in the workspace.
     */
    templatePath: string

    /**
     * Path to the (generated) `event.json` file placed in `baseBuildDir` for SAM to discover.
     *
     * The file contains the event payload JSON to be consumed by SAM.
     */
    eventPayloadFile: string

    /**
     * Path to the (generated) `env-vars.json` file placed in `baseBuildDir` for SAM to discover.
     *
     * The file contains a JSON map of environment variables to be consumed by
     * SAM, resolved from `template.yaml` and/or `lambda.environmentVariables`.
     */
    envFile: string

    //
    // Debug properties (when user runs with debugging enabled).
    //
    /** vscode implicit field, set if user invokes "Run (Start Without Debugging)". */
    noDebug?: boolean
    debuggerPath?: string
    debugPort?: number

    /**
     * Credentials to add as env vars if available
     */
    awsCredentials?: Credentials

    /**
     * parameter overrides specified in the `sam.template.parameters` field
     */
    parameterOverrides?: string[]

    //
    //  Invocation properties (for "execute" phase, after "config" phase).
    //  Non-serializable...
    //
    samLocalInvokeCommand?: SamLocalInvokeCommand
    onWillAttachDebugger?(debugPort: number, timeout: Timeout, channelLogger: ChannelLogger): Promise<void>
}

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
                    for (const resourceKey of Object.keys(templateDatum.template.Resources)) {
                        const resource = templateDatum.template.Resources[resourceKey]
                        if (resource) {
                            const runtimeName = resource.Properties?.Runtime
                            configs.push(
                                createTemplateAwsSamDebugConfig(
                                    folder,
                                    CloudFormation.getStringForProperty(runtimeName, templateDatum.template),
                                    resourceKey,
                                    templateDatum.path
                                )
                            )
                        }
                    }
                }
            }
            getLogger().verbose(`provideDebugConfigurations: debugconfigs: ${JSON.stringify(configs)}`)
        }

        return configs
    }

    /**
     * Generates a full run-config from a user-provided config, then
     * runs/debugs it (essentially `sam build` + `sam local invoke`).
     *
     * If `launch.json` is missing, attempts to generate a config dynamically.
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
        const resolvedConfig = await this.makeConfig(folder, config, token)
        if (!resolvedConfig) {
            return undefined
        }
        await this.invokeConfig(resolvedConfig)
        // TODO: return config here, and remove use of `startDebugging()` in `localLambdaRunner.ts`.
        return undefined
    }

    /**
     * Performs the CONFIG phase of SAM run/debug:
     * - gathers info from `launch.json`, project workspace, OS
     * - creates runtime-specific files
     * - creates `input-template.yaml`, `env-vars.json`, `event.json` files
     * - creates a config object to handoff to VSCode
     *
     * @returns Config to handoff to VSCode or nodejs/python/dotnet plugin (can
     * also be used in `vscode.debug.startDebugging`)
     */
    public async makeConfig(
        folder: vscode.WorkspaceFolder | undefined,
        config: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<SamLaunchRequestArgs | undefined> {
        if (token?.isCancellationRequested) {
            return undefined
        }
        folder =
            folder ?? (vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0] : undefined)
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
            vscode.window
                .showErrorMessage(
                    localize(
                        'AWS.sam.debugger.noLaunchJson',
                        'AWS SAM: To debug a Lambda locally, create a launch.json from the Run panel, then select a configuration.'
                    ),
                    localize('AWS.gotoRunPanel', 'Run panel')
                )
                .then(async result => {
                    if (!result) {
                        return
                    }
                    await vscode.commands.executeCommand('workbench.view.debug')
                })
            return undefined
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
        const template = getTemplate(folder, config)
        const templateResource = getTemplateResource(folder, config)
        const codeRoot = getCodeRoot(folder, config)
        // Handler is the only field that we need to parse refs for.
        // This is necessary for Python debugging since we have to create the temporary entry file
        // Other refs can fail; SAM will handle them.
        const handlerName = getHandlerName(folder, config)

        if (templateInvoke?.templatePath) {
            // Normalize to absolute path.
            // TODO: If path is relative, it is relative to launch.json (i.e. .vscode directory).
            templateInvoke.templatePath = pathutil.normalize(tryGetAbsolutePath(folder, templateInvoke.templatePath))
        }

        const runtime: string | undefined =
            config.lambda?.runtime ??
            (template
                ? CloudFormation.getStringForProperty(templateResource?.Properties?.Runtime, template)
                : undefined) ??
            getDefaultRuntime(getRuntimeFamily(editor?.document?.languageId ?? 'unknown'))

        const lambdaMemory =
            (template
                ? CloudFormation.getNumberForProperty(templateResource?.Properties?.MemorySize, template)
                : undefined) ?? config.lambda?.memoryMb
        const lambdaTimeout =
            (template
                ? CloudFormation.getNumberForProperty(templateResource?.Properties?.Timeout, template)
                : undefined) ?? config.lambda?.timeoutSec

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
            vscode.Uri.parse(templateInvoke.templatePath!!)

        let awsCredentials: Credentials | undefined

        // TODO: Remove this line to enable dotnetcore3.1 debugging when it becomes available
        if (runtime === 'dotnetcore3.1' && !config.noDebug) {
            vscode.window.showWarningMessage(
                localize(
                    'AWS.output.sam.local.no.net.3.1.debug',
                    'SAM debugging is not supported for dotnetcore3.1 runtime. Function will run locally without debug.'
                )
            )
            config.noDebug = true
        }

        if (config.aws?.credentials) {
            const credentialsProviderId = fromString(config.aws.credentials)
            try {
                awsCredentials = await getCredentialsFromStore(credentialsProviderId, this.ctx.credentialsStore)
            } catch (err) {
                getLogger().error(err as Error)
                notifyUserInvalidCredentials(credentialsProviderId)
                return undefined
            }
        }

        let parameterOverrideArr: string[] | undefined
        const params = config.sam?.template?.parameters
        if (params) {
            parameterOverrideArr = []
            for (const key of Object.keys(params)) {
                parameterOverrideArr.push(`${key}=${params[key].toString()}`)
            }
        }

        let launchConfig: SamLaunchRequestArgs = {
            ...config,
            request: 'attach',
            codeRoot: codeRoot ?? '',
            workspaceFolder: folder,
            runtime: runtime,
            runtimeFamily: runtimeFamily,
            handlerName: handlerName,
            documentUri: documentUri,
            templatePath: pathutil.normalize(templateInvoke?.templatePath),
            eventPayloadFile: '', // Populated by makeConfig().
            envFile: '', // Populated by makeConfig().
            debugPort: config.noDebug ? undefined : await getStartPort(),
            lambda: {
                ...config.lambda,
                memoryMb: lambdaMemory,
                timeoutSec: lambdaTimeout,
                environmentVariables: { ...config.lambda?.environmentVariables },
            },
            awsCredentials: awsCredentials,
            parameterOverrides: parameterOverrideArr,
        }

        //
        // Configure and launch.
        //
        // 1. prepare a bunch of arguments
        // 2. do `sam build`
        // 3. do `sam local invoke`
        //
        await makeConfig(launchConfig)
        switch (launchConfig.runtimeFamily) {
            case RuntimeFamily.NodeJS: {
                // Make a NodeJS launch-config from the generic config.
                launchConfig = await tsDebug.makeTypescriptConfig(launchConfig)
                break
            }
            case RuntimeFamily.Python: {
                // Make a Python launch-config from the generic config.
                launchConfig = await pythonDebug.makePythonDebugConfig(launchConfig)
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

        if (launchConfig.request !== 'attach' && launchConfig.request !== 'launch') {
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

    /**
     * Performs the EXECUTE phase of SAM run/debug.
     */
    public async invokeConfig(config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
        switch (config.runtimeFamily) {
            case RuntimeFamily.NodeJS: {
                config.type = 'node'
                const c = await tsDebug.invokeTypescriptLambda(this.ctx, config as NodejsDebugConfiguration)
                return c
            }
            case RuntimeFamily.Python: {
                config.type = 'python'
                return await pythonDebug.invokePythonLambda(this.ctx, config as PythonDebugConfiguration)
            }
            case RuntimeFamily.DotNetCore: {
                config.type = 'coreclr'
                return await csharpDebug.invokeCsharpLambda(this.ctx, config)
            }
            default: {
                throw Error(`unknown runtimeFamily: ${config.runtimeFamily}`)
            }
        }
    }
}
