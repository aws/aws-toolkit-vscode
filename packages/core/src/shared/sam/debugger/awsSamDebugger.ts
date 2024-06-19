/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as nls from 'vscode-nls'
import {
    getCodeRoot,
    getHandlerName,
    getTemplateResource,
    NodejsDebugConfiguration,
    PythonDebugConfiguration,
    GoDebugConfiguration,
    getTemplate,
    getArchitecture,
    isImageLambdaConfig,
} from '../../../lambda/local/debugConfiguration'
import {
    Architecture,
    getDefaultRuntime,
    getFamily,
    getRuntimeFamily,
    goRuntimes,
    RuntimeFamily,
} from '../../../lambda/models/samLambdaRuntime'
import { Timeout } from '../../utilities/timeoutUtils'
import * as csharpDebug from './csharpSamDebug'
import * as javaDebug from './javaSamDebug'
import * as pythonDebug from './pythonSamDebug'
import * as tsDebug from './typescriptSamDebug'
import * as goDebug from './goSamDebug'
import { ExtContext } from '../../extensions'
import { isInDirectory, makeTemporaryToolkitFolder } from '../../filesystemUtilities'
import { getLogger } from '../../logger'
import { getStartPort } from '../../utilities/debuggerUtils'
import * as pathutil from '../../utilities/pathUtils'
import { tryGetAbsolutePath } from '../../utilities/workspaceUtils'
import {
    AwsSamDebuggerConfiguration,
    AWS_SAM_DEBUG_TYPE,
    createApiAwsSamDebugConfig,
    createTemplateAwsSamDebugConfig,
} from './awsSamDebugConfiguration'
import { TemplateTargetProperties } from './awsSamDebugConfiguration.gen'
import {
    AwsSamDebugConfigurationValidator,
    DefaultAwsSamDebugConfigurationValidator,
} from './awsSamDebugConfigurationValidator'
import { getInputTemplatePath, makeInputTemplate, makeJsonFiles } from '../localLambdaRunner'
import { SamLocalInvokeCommand } from '../cli/samCliLocalInvoke'
import { getCredentialsFromStore } from '../../../auth/credentials/store'
import { fromString } from '../../../auth/providers/credentials'
import { Credentials } from '@aws-sdk/types'
import * as CloudFormation from '../../cloudformation/cloudformation'
import { getSamCliContext, getSamCliVersion } from '../cli/samCliContext'
import { minSamCliVersionForImageSupport, minSamCliVersionForGoSupport } from '../cli/samCliValidator'
import { getIdeProperties, isCloud9 } from '../../extensionUtilities'
import { resolve } from 'path'
import globals from '../../extensionGlobals'
import { Runtime, telemetry } from '../../telemetry/telemetry'
import { ErrorInformation, isUserCancelledError, ToolkitError } from '../../errors'
import { openLaunchJsonFile } from './commands/addSamDebugConfiguration'
import { Logging } from '../../logger/commands'
import { credentialHelpUrl, samTroubleshootingUrl } from '../../constants'
import { Auth } from '../../../auth/auth'
import { openUrl } from '../../utilities/vsCodeUtils'

const localize = nls.loadMessageBundle()

interface NotificationButton<T = unknown> {
    readonly label: string
    readonly onClick: () => Promise<T> | T
}

class SamLaunchRequestError extends ToolkitError.named('SamLaunchRequestError') {
    private readonly buttons: NotificationButton[]

    public constructor(message: string, info?: ErrorInformation & { readonly extraButtons?: NotificationButton[] }) {
        super(message, info)
        this.buttons = info?.extraButtons ?? [
            {
                label: localize('AWS.generic.message.troubleshooting', 'Troubleshooting'),
                onClick: () => openUrl(samTroubleshootingUrl),
            },
            {
                label: localize('AWS.generic.message.openConfig', 'Open Launch Config'),
                onClick: openLaunchJsonFile,
            },
        ]
    }

    public async showNotification(): Promise<void> {
        if (isUserCancelledError(this)) {
            getLogger().verbose(`SAM run/debug: user cancelled`)
            return
        }

        const logId = getLogger().error(this.trace)

        const viewLogsButton = {
            label: localize('AWS.generic.message.viewLogs', 'View Logs...'),
            onClick: () => Logging.instance.viewLogsAtMessage.execute(logId),
        }

        const buttonsWithLogs = [viewLogsButton, ...this.buttons]

        await vscode.window.showErrorMessage(this.message, ...buttonsWithLogs.map(b => b.label)).then(resp => {
            return buttonsWithLogs.find(({ label }) => label === resp)?.onClick()
        })
    }
}

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

    /** Path to (generated) directory used as a working/staging area for SAM. */
    baseBuildDir?: string

    /** sam cli "--mount-with" option. */
    mountWith?: 'read' | 'write'

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
    eventPayloadFile?: string

    /**
     * Path to the (generated) `env-vars.json` file placed in `baseBuildDir` for SAM to discover.
     *
     * The file contains a JSON map of environment variables to be consumed by
     * SAM, resolved from `template.yaml` and/or `lambda.environmentVariables`.
     */
    envFile?: string

    //
    // Debug properties (when user runs with debugging enabled).
    //
    /** vscode implicit field, set if user invokes "Run (Start Without Debugging)". */
    noDebug?: boolean
    // Local (host) directory given to "sam foo --debugger-path …"
    debuggerPath?: string
    debugArgs?: string[]
    /** Passed to SAM CLI --container-env-vars. For Toolkit use, not exposed to the user. */
    containerEnvVars?: { [k: string]: string }
    /**
     * Path to `container-env-vars.json` (generated from `containerEnvVars`).
     * For Toolkit use, not exposed to the user.
     */
    containerEnvFile?: string
    debugPort?: number
    /** Local API webserver port. */
    apiPort?: number

    /**
     * Credentials to add as env vars if available
     */
    awsCredentials?: Credentials

    /**
     * parameter overrides specified in the `sam.template.parameters` field
     */
    parameterOverrides?: string[]

    /**
     * HACK: Forces use of `ikp3db` python debugger in Cloud9 (and in tests).
     */
    useIkpdb?: boolean

    //
    //  Invocation properties (for "execute" phase, after "config" phase).
    //  Non-serializable...
    //
    samLocalInvokeCommand?: SamLocalInvokeCommand
    onWillAttachDebugger?(debugPort: number, timeout: Timeout): Promise<void>

    /**
     * Specifies container architecture. Necessary for C#, to either swap debugger download or to force into no-debug mode
     */
    architecture?: Architecture
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

        const configs: AwsSamDebuggerConfiguration[] = []
        if (folder) {
            const folderPath = folder.uri.fsPath
            const templates = (await globals.templateRegistry).items

            for (const templateDatum of templates) {
                if (isInDirectory(folderPath, templateDatum.path)) {
                    if (!templateDatum.item.Resources) {
                        getLogger().error(`provideDebugConfigurations: invalid template: ${templateDatum.path}`)
                        continue
                    }
                    for (const resourceKey of Object.keys(templateDatum.item.Resources)) {
                        const resource = templateDatum.item.Resources[resourceKey]
                        if (resource) {
                            // we do not know enough to populate the runtime field for Image-based Lambdas
                            const runtimeName = CloudFormation.isZipLambdaResource(resource?.Properties)
                                ? CloudFormation.getStringForProperty(
                                      resource?.Properties,
                                      'Runtime',
                                      templateDatum.item
                                  ) ?? ''
                                : ''
                            configs.push(
                                createTemplateAwsSamDebugConfig(
                                    folder,
                                    runtimeName,
                                    false,
                                    resourceKey,
                                    templateDatum.path
                                )
                            )
                            const events = resource?.Properties?.Events
                            if (events) {
                                // Check for api resources to add
                                for (const key in events) {
                                    const value = events[key]
                                    if (value.Type === 'Api') {
                                        const properties = value.Properties as CloudFormation.ApiEventProperties
                                        configs.push(
                                            createApiAwsSamDebugConfig(
                                                folder,
                                                runtimeName,
                                                resourceKey,
                                                templateDatum.path,
                                                {
                                                    path: properties?.Path,
                                                    httpMethod: properties?.Method,
                                                }
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            getLogger().verbose(`provideDebugConfigurations: debugconfigs: ${JSON.stringify(configs)}`)
        }

        return configs
    }

    /**
     * Necessary to get the debug configuration over to the resolveDebugConfigurationWithSubstitutedVariables function below
     *
     * @param folder Workspace folder
     * @param config User-provided config (from launch.json)
     * @param token  Cancellation token
     */
    public async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration | undefined> {
        if (isCloud9()) {
            // TODO: remove when Cloud9 supports ${workspaceFolder}.
            await this.makeAndInvokeConfig(folder, config, token)
            return undefined
        }
        return config
    }

    /**
     * Generates a full run-config from a user-provided config, then
     * runs/debugs it (essentially `sam build` + `sam local invoke`).
     *
     * If `launch.json` is missing, attempts to generate a config dynamically.
     *
     * @param folder Workspace folder
     * @param config User-provided config (from launch.json)
     * @param token  Cancellation token
     */
    // eslint-disable-next-line id-length
    public async resolveDebugConfigurationWithSubstitutedVariables(
        folder: vscode.WorkspaceFolder | undefined,
        config: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<undefined> {
        await this.makeAndInvokeConfig(folder, config, token)
        // TODO: return config here, and remove use of `startDebugging()` in `localLambdaRunner.ts`.
        return undefined
    }

    private async makeAndInvokeConfig(
        folder: vscode.WorkspaceFolder | undefined,
        config: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<void> {
        try {
            if (config.invokeTarget.target === 'api') {
                await telemetry.apigateway_invokeLocal.run(async span => {
                    const resolved = await this.makeConfig(folder, config, token)
                    span.record({ httpMethod: resolved.api?.httpMethod })

                    return this.invokeConfig(resolved)
                })
            } else {
                await telemetry.lambda_invokeLocal.run(async () => {
                    const resolved = await this.makeConfig(folder, config, token)

                    return this.invokeConfig(resolved)
                })
            }
        } catch (err) {
            if (err instanceof SamLaunchRequestError) {
                void err.showNotification()
            } else if (err instanceof ToolkitError) {
                void new SamLaunchRequestError(err.message, { ...err }).showNotification()
            } else {
                void SamLaunchRequestError.chain(err, 'Failed to run launch configuration').showNotification()
            }
        }
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
    ): Promise<SamLaunchRequestArgs> {
        if (token?.isCancellationRequested) {
            throw new ToolkitError('Cancellation requested', { cancelled: true })
        }

        folder =
            folder ?? (vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0] : undefined)
        if (!folder) {
            const message = localize(
                'AWS.sam.debugger.noWorkspace',
                'Choose a workspace, then try again',
                getIdeProperties().company
            )

            throw new SamLaunchRequestError(message, { code: 'NoWorkspaceFolder', extraButtons: [] })
        }

        // If "request" field is missing this means launch.json does not exist.
        // User/vscode expects us to dynamically decide defaults if possible.
        const hasLaunchJson = !!config.request
        const configValidator: AwsSamDebugConfigurationValidator = new DefaultAwsSamDebugConfigurationValidator(folder)

        if (!hasLaunchJson) {
            const message = localize(
                'AWS.sam.debugger.noLaunchJson',
                'To debug a Lambda locally, create a launch.json from the Run panel, then select a configuration.'
            )

            throw new SamLaunchRequestError(message, {
                code: 'NoLaunchConfig',
                extraButtons: [
                    {
                        label: localize('AWS.gotoRunPanel', 'Run panel'),
                        onClick: () => vscode.commands.executeCommand('workbench.view.debug'),
                    },
                ],
            })
        } else {
            const registry = await globals.templateRegistry
            const rv = await configValidator.validate(config, registry)
            if (!rv.isValid) {
                throw new ToolkitError(`Invalid launch configuration: ${rv.message}`, { code: 'BadLaunchConfig' })
            } else if (rv.message) {
                void vscode.window.showInformationMessage(rv.message)
            }
            getLogger().verbose(`SAM debug: config: ${JSON.stringify(config.name)}`)
        }

        const editor = vscode.window.activeTextEditor
        const templateInvoke = config.invokeTarget as TemplateTargetProperties
        const template = await getTemplate(folder, config)
        const templateResource = await getTemplateResource(folder, config)
        const codeRoot = await getCodeRoot(folder, config)
        const architecture = getArchitecture(template, templateResource, config.invokeTarget)
        // Handler is the only field that we need to parse refs for.
        // This is necessary for Python debugging since we have to create the temporary entry file
        // Other refs can fail; SAM will handle them.
        const handlerName = await getHandlerName(folder, config)

        config.baseBuildDir = resolve(folder.uri.fsPath, config.sam?.buildDir ?? (await makeTemporaryToolkitFolder()))
        await fs.ensureDir(config.baseBuildDir)

        if (templateInvoke?.templatePath) {
            // Normalize to absolute path.
            // TODO: If path is relative, it is relative to launch.json (i.e. .vscode directory).
            templateInvoke.templatePath = pathutil.normalize(tryGetAbsolutePath(folder, templateInvoke.templatePath))
        } else if (config.invokeTarget.target === 'code') {
            const codeConfig = config as SamLaunchRequestArgs & { invokeTarget: { target: 'code' } }
            // 'projectRoot' may be a relative path
            // Older code left this property as relative, but there's no benefit in doing that since it's relative to the workspace
            codeConfig.invokeTarget.projectRoot = pathutil.normalize(
                resolve(folder.uri.fsPath, config.invokeTarget.projectRoot)
            )
            templateInvoke.templatePath = getInputTemplatePath(codeConfig)
        }

        const isZip = CloudFormation.isZipLambdaResource(templateResource?.Properties)
        const runtime: string | undefined =
            config.lambda?.runtime ??
            (template && isZip
                ? CloudFormation.getStringForProperty(templateResource?.Properties, 'Runtime', template)
                : undefined) ??
            getDefaultRuntime(getRuntimeFamily(editor?.document?.languageId ?? 'unknown'))

        const lambdaMemory =
            (template
                ? CloudFormation.getNumberForProperty(templateResource?.Properties, 'MemorySize', template)
                : undefined) ?? config.lambda?.memoryMb
        const lambdaTimeout =
            (template
                ? CloudFormation.getNumberForProperty(templateResource?.Properties, 'Timeout', template)
                : undefined) ?? config.lambda?.timeoutSec

        // TODO: Remove this when min sam version is > 1.13.0
        if (!isZip) {
            const samCliVersion = await getSamCliVersion(this.ctx.samCliContext())
            if (semver.lt(samCliVersion, minSamCliVersionForImageSupport)) {
                const message = localize(
                    'AWS.output.sam.no.image.support',
                    'Support for Image-based Lambdas requires a minimum SAM CLI version of 1.13.0.'
                )

                throw new SamLaunchRequestError(message, { code: 'UnsupportedSamVersion', details: { samCliVersion } })
            }
        }

        if (!runtime) {
            const message = localize(
                'AWS.sam.debugger.failedLaunch.missingRuntime',
                'Toolkit could not infer a runtime for config: {0}. Add a "lambda.runtime" field to your launch configuration.',
                config.name
            )

            throw new SamLaunchRequestError(message, { code: 'MissingRuntime' })
        }

        // SAM CLI versions before 1.18.1 do not work correctly for Go debugging.
        // TODO: remove this when min sam version is >= 1.18.1
        if (goRuntimes.includes(runtime) && !config.noDebug) {
            const samCliVersion = await getSamCliVersion(this.ctx.samCliContext())
            if (semver.lt(samCliVersion, minSamCliVersionForGoSupport)) {
                void vscode.window.showWarningMessage(
                    localize(
                        'AWS.output.sam.local.no.go.support',
                        'Debugging go1.x lambdas requires a minimum SAM CLI version of {0}. Function will run locally without debug.',
                        minSamCliVersionForGoSupport
                    )
                )
                config.noDebug = true
            }
        }

        const runtimeFamily = getFamily(runtime)
        const documentUri =
            vscode.window.activeTextEditor?.document.uri ??
            // XXX: don't know what URI to choose...
            vscode.Uri.parse(templateInvoke.templatePath!)

        let awsCredentials = await this.ctx.awsContext.getCredentials()
        if (!awsCredentials && !config.aws?.credentials) {
            getLogger().warn('SAM debug: missing AWS credentials (Toolkit is not connected)')
        } else if (config.aws?.credentials) {
            // "aws.credentials" defined in the launch-config takes precedence
            // over Toolkit's current active credentials.
            let fromStore: Credentials | undefined
            try {
                const credentialsId = fromString(config.aws.credentials)
                fromStore = await getCredentialsFromStore(credentialsId, this.ctx.credentialsStore)
            } catch {
                getLogger().error(`SAM debug: fromString('${config.aws.credentials}') failed`)
            }
            if (fromStore) {
                awsCredentials = fromStore
            } else {
                const credentialsId = config.aws.credentials
                const getHelp = localize('AWS.generic.message.getHelp', 'Get Help...')
                // TODO: getHelp page for Cloud9.
                const extraButtons = isCloud9()
                    ? []
                    : [
                          {
                              label: getHelp,
                              onClick: () => openUrl(vscode.Uri.parse(credentialHelpUrl)),
                          },
                      ]

                throw new SamLaunchRequestError(`Invalid credentials found in launch configuration: ${credentialsId}`, {
                    code: 'InvalidCredentials',
                    extraButtons,
                })
            }
        }

        if (config.api) {
            config.api.headers = {
                'content-type': 'application/json',
                ...(config.api.headers ? config.api.headers : {}),
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

        // TODO: Let the OS (or SAM CLI) assign the port, then we need to
        // scrape SAM CLI to find the port that was actually used?
        const apiPort = config.invokeTarget.target === 'api' ? await getStartPort() : undefined
        const debugPort = config.noDebug ? undefined : await getStartPort(apiPort ? apiPort + 1 : undefined)
        let launchConfig: SamLaunchRequestArgs = {
            ...config,
            request: 'attach',
            codeRoot: codeRoot ?? '',
            workspaceFolder: folder,
            runtime: runtime as Runtime,
            runtimeFamily: runtimeFamily,
            handlerName: handlerName,
            documentUri: documentUri,
            templatePath: pathutil.normalize(templateInvoke?.templatePath),
            eventPayloadFile: '', // Populated by makeConfig().
            envFile: '', // Populated by makeConfig().
            apiPort: apiPort,
            debugPort: debugPort,
            invokeTarget: {
                ...config.invokeTarget,
            },
            lambda: {
                ...config.lambda,
                memoryMb: lambdaMemory,
                timeoutSec: lambdaTimeout,
                environmentVariables: { ...config.lambda?.environmentVariables },
            },
            awsCredentials: awsCredentials,
            parameterOverrides: parameterOverrideArr,
            useIkpdb: isCloud9() || !!(config as any).useIkpdb,
            architecture: architecture,
        }

        //
        // Configure and launch.
        //
        // 1. prepare a bunch of arguments
        // 2. do `sam build`
        // 3. do `sam local invoke`
        //
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
            case RuntimeFamily.DotNet: {
                // Make a DotNet launch-config from the generic config.
                launchConfig = await csharpDebug.makeCsharpConfig(launchConfig)
                break
            }
            case RuntimeFamily.Go: {
                launchConfig = await goDebug.makeGoConfig(launchConfig)
                break
            }
            case RuntimeFamily.Java: {
                // Make a Java launch-config from the generic config.
                launchConfig = await javaDebug.makeJavaConfig(launchConfig)
                break
            }
            default: {
                const message = localize(
                    'AWS.sam.debugger.invalidRuntime',
                    'Unknown or unsupported runtime: {0}',
                    runtime
                )

                throw new ToolkitError(message, { code: 'UnsupportedRuntime' })
            }
        }

        // generate template for target=code
        if (launchConfig.invokeTarget.target === 'code') {
            const codeConfig = launchConfig as SamLaunchRequestArgs & { invokeTarget: { target: 'code' } }
            await makeInputTemplate(codeConfig)
        }

        await makeJsonFiles(launchConfig)

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
        telemetry.record({
            debug: !config.noDebug,
            runtime: config.runtime as Runtime,
            lambdaArchitecture: config.architecture,
            lambdaPackageType: (await isImageLambdaConfig(config)) ? 'Image' : 'Zip',
            version: await getSamCliVersion(getSamCliContext()),
        })

        await Auth.instance.tryAutoConnect()
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
            case RuntimeFamily.DotNet: {
                config.type = 'coreclr'
                return await csharpDebug.invokeCsharpLambda(this.ctx, config)
            }
            case RuntimeFamily.Go: {
                config.type = 'go'
                return await goDebug.invokeGoLambda(this.ctx, config as GoDebugConfiguration)
            }
            case RuntimeFamily.Java: {
                config.type = 'java'
                return await javaDebug.invokeJavaLambda(this.ctx, config)
            }
            default: {
                throw new Error(`unknown runtimeFamily: ${config.runtimeFamily}`)
            }
        }
    }
}
