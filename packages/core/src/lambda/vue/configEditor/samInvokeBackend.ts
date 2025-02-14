/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { LaunchConfiguration } from '../../../shared/debug/launchConfiguration'
import { getLogger } from '../../../shared/logger/logger'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import {
    AwsSamDebuggerConfiguration,
    isCodeTargetProperties,
    isTemplateTargetProperties,
    TemplateTargetProperties,
} from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import {
    DefaultAwsSamDebugConfigurationValidator,
    resolveWorkspaceFolderVariable,
} from '../../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import * as input from '../../../shared/ui/input'
import * as picker from '../../../shared/ui/picker'
import { addCodiconToString } from '../../../shared/utilities/textUtilities'
import { sampleRequestPath } from '../../constants'
import { tryGetAbsolutePath } from '../../../shared/utilities/workspaceUtils'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'
import { openLaunchJsonFile } from '../../../shared/sam/debugger/commands/addSamDebugConfiguration'
import { getSampleLambdaPayloads } from '../../utils'
import { samLambdaCreatableRuntimes } from '../../models/samLambdaRuntime'
import globals from '../../../shared/extensionGlobals'
import { VueWebview } from '../../../webviews/main'
import { Commands } from '../../../shared/vscode/commands2'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { fs } from '../../../shared/fs/fs'
import { ToolkitError } from '../../../shared/errors'
import { ResourceNode } from '../../../awsService/appBuilder/explorer/nodes/resourceNode'

const localize = nls.loadMessageBundle()

export interface ResourceData {
    logicalId: string
    region: string
    arn: string
    location: string
    handler: string
    runtime: string
    stackName: string
    source: string
    environment?: {
        Variables: Record<string, any>
    }
}

export type AwsSamDebuggerConfigurationLoose = AwsSamDebuggerConfiguration & {
    invokeTarget: Omit<
        AwsSamDebuggerConfiguration['invokeTarget'],
        'templatePath' | 'logicalId' | 'lambdaHandler' | 'projectRoot'
    > & {
        templatePath: string
        logicalId: string
        lambdaHandler: string
        projectRoot: string
    }
}

interface SampleQuickPickItem extends vscode.QuickPickItem {
    filename: string
}

export interface LaunchConfigPickItem extends vscode.QuickPickItem {
    index: number
    config?: AwsSamDebuggerConfiguration
}

export class SamInvokeWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/lambda/vue/configEditor/index.js'
    public readonly id = 'createLambda'

    public constructor(
        private readonly config?: AwsSamDebuggerConfiguration,
        private readonly data?: ResourceData
    ) {
        super(SamInvokeWebview.sourcePath)
    }

    public getRuntimes() {
        return samLambdaCreatableRuntimes().toArray().sort()
    }

    public init() {
        return this.config
    }

    public getResourceData() {
        return this.data
    }

    public async getSamLaunchConfigs(): Promise<LaunchConfigPickItem[] | undefined> {
        // TODO: Find a better way to infer this. Might need another arg from the frontend (depends on the context in which the launch config is made?)
        const workspaceFolder = vscode.workspace.workspaceFolders?.length
            ? vscode.workspace.workspaceFolders[0]
            : undefined
        if (!workspaceFolder) {
            void vscode.window.showErrorMessage(localize('AWS.lambda.form.noFolder', 'No workspace folder found.'))
            return
        }
        const uri = workspaceFolder.uri
        const launchConfig = new LaunchConfiguration(uri)
        const pickerItems = await this.getLaunchConfigQuickPickItems(launchConfig, uri)
        return pickerItems
    }

    /**
     * Open a quick pick containing the names of launch configs in the `launch.json` array.
     * Filter out non-supported launch configs.
     */
    public async loadSamLaunchConfig(): Promise<AwsSamDebuggerConfiguration | undefined> {
        const pickerItems: LaunchConfigPickItem[] = (await this.getSamLaunchConfigs()) || []

        if (pickerItems.length === 0) {
            pickerItems.push({
                index: -1,
                label: localize('AWS.lambda.form.noDebugConfigs', 'No aws-sam debug configurations found.'),
                detail: localize('AWS.picker.dynamic.noItemsFound.detail', 'Click here to go back'),
            })
        }
        const qp = picker.createQuickPick({
            items: pickerItems,
            options: {
                title: localize('AWS.lambda.form.selectDebugConfig', 'Select Debug Configuration'),
            },
        })

        const choices = await picker.promptUser({
            picker: qp,
        })
        const pickerResponse = picker.verifySinglePickerOutput<LaunchConfigPickItem>(choices)

        if (!pickerResponse || pickerResponse.index === -1) {
            return
        }
        return pickerResponse.config!
    }

    /**
     * Open a quick pick containing upstream sample payloads.
     * Call back into the webview with the contents of the payload to add to the JSON field.
     */
    public async getSamplePayload(): Promise<string | undefined> {
        try {
            const inputs: SampleQuickPickItem[] = (await getSampleLambdaPayloads()).map((entry) => {
                return { label: entry.name ?? '', filename: entry.filename ?? '' }
            })

            const qp = picker.createQuickPick({
                items: inputs,
                options: {
                    title: localize('AWS.lambda.form.pickSampleInput', 'Choose Sample Input'),
                },
            })

            const choices = await picker.promptUser({
                picker: qp,
            })
            const pickerResponse = picker.verifySinglePickerOutput<SampleQuickPickItem>(choices)

            if (!pickerResponse) {
                return
            }
            const sampleUrl = `${sampleRequestPath}${pickerResponse.filename}`
            const resp = await new HttpResourceFetcher(sampleUrl, { showUrl: true }).get()
            const sample = (await resp?.text()) ?? ''

            return sample
        } catch (err) {
            getLogger().error('Error getting manifest data..: %O', err as Error)
            throw ToolkitError.chain(err, 'getting manifest data')
        }
    }

    protected getTemplateRegistry() {
        return globals.templateRegistry
    }

    /**
     * Get all templates in the registry.
     * Call back into the webview with the registry contents.
     */
    public async getTemplate() {
        const items: (vscode.QuickPickItem & { templatePath: string })[] = []
        const noTemplate = 'NOTEMPLATEFOUND'
        for (const template of (await this.getTemplateRegistry()).items) {
            const resources = template.item.Resources
            if (resources) {
                for (const resource of Object.keys(resources)) {
                    if (
                        resources[resource]?.Type === CloudFormation.LAMBDA_FUNCTION_TYPE ||
                        resources[resource]?.Type === CloudFormation.SERVERLESS_FUNCTION_TYPE ||
                        resources[resource]?.Type === CloudFormation.SERVERLESS_API_TYPE
                    ) {
                        items.push({
                            label: resource,
                            detail: localize('AWS.lambda.form.selectResource.detail', 'Template: {0}', template.path),
                            templatePath: template.path,
                        })
                    }
                }
            }
        }

        if (items.length === 0) {
            items.push({
                label: localize(
                    'AWS.lambda.form.selectResource.noTemplates',
                    'No templates with valid SAM functions found.'
                ),
                detail: localize('AWS.picker.dynamic.noItemsFound.detail', 'Click here to go back'),
                templatePath: noTemplate,
            })
        }

        const qp = picker.createQuickPick({
            items,
            options: {
                title: localize('AWS.lambda.form.selectResource', 'Select Resource'),
            },
        })

        const choices = await picker.promptUser({
            picker: qp,
        })
        const selectedTemplate = picker.verifySinglePickerOutput(choices)

        if (!selectedTemplate || selectedTemplate.templatePath === noTemplate) {
            return
        }

        return {
            logicalId: selectedTemplate.label,
            template: selectedTemplate.templatePath,
        }
    }

    // This method serves as a wrapper around the backend function `openLaunchJsonFile`.
    // The frontend cannot directly import and invoke backend functions like `openLaunchJsonFile`
    // because doing so would break the webview environment by introducing server-side logic
    // into client-side code. Instead, this method acts as an interface or bridge, allowing
    // the frontend to request the backend to open the launch configuration file without
    // directly coupling the frontend to backend-specific implementations.
    public async openLaunchConfig() {
        await openLaunchJsonFile()
    }

    public async promptFile() {
        const fileLocations = await vscode.window.showOpenDialog({
            openLabel: 'Open',
        })

        if (!fileLocations || fileLocations.length === 0) {
            return undefined
        }

        try {
            const fileContent = await fs.readFileBytes(fileLocations[0].fsPath)
            return {
                sample: fileContent,
                selectedFilePath: fileLocations[0].fsPath,
                selectedFile: this.getFileName(fileLocations[0].fsPath),
            }
        } catch (e) {
            getLogger().error('readFileSync: Failed to read file at path %s %O', fileLocations[0].fsPath, e)
            throw ToolkitError.chain(e, 'Failed to read selected file')
        }
    }

    public getFileName(filePath: string): string {
        return path.basename(filePath)
    }
    /**
     * Open a quick pick containing the names of launch configs in the `launch.json` array, plus a "Create New Entry" entry.
     * On selecting a name, overwrite the existing entry in the `launch.json` array and resave the file.
     * On selecting "Create New Entry", prompt the user for a name and save the contents to the end of the `launch.json` array.
     * @param config Config to save
     */
    public async saveLaunchConfig(config: AwsSamDebuggerConfiguration): Promise<void> {
        const uri = await this.getUriFromLaunchConfig(config)
        if (!uri) {
            // TODO Localize
            void vscode.window.showErrorMessage(
                'Toolkit requires a target resource in order to save a debug configuration'
            )
            return
        }

        const launchConfig = new LaunchConfiguration(uri)
        const launchConfigItems = await this.getLaunchConfigQuickPickItems(launchConfig, uri)
        const pickerItems = [
            {
                label: addCodiconToString(
                    'add',
                    localize('AWS.command.addSamDebugConfiguration', 'Add Local Invoke and Debug Configuration')
                ),
                index: -1,
                alwaysShow: true,
            },
            ...launchConfigItems,
        ]

        const qp = picker.createQuickPick({
            items: pickerItems,
            options: {
                title: localize('AWS.lambda.form.selectDebugConfig', 'Select Debug Configuration'),
            },
        })

        const choices = await picker.promptUser({
            picker: qp,
        })
        const pickerResponse = picker.verifySinglePickerOutput<LaunchConfigPickItem>(choices)

        if (!pickerResponse) {
            return
        }

        if (pickerResponse.index === -1) {
            const ib = input.createInputBox({
                options: {
                    prompt: localize('AWS.lambda.form.debugConfigName', 'Input Name For Debug Configuration'),
                },
            })
            const response = await input.promptUser({ inputBox: ib })
            if (response) {
                await launchConfig.addDebugConfiguration(finalizeConfig(config, response))
                await this.openLaunchConfig()
            }
        } else {
            // use existing label
            await launchConfig.editDebugConfiguration(
                finalizeConfig(config, pickerResponse.label),
                pickerResponse.index
            )
            await this.openLaunchConfig()
        }
    }

    /**
     * Validate and execute the provided launch config.
     * TODO: Post validation failures back to webview?
     * @param config Config to invoke
     */
    public async invokeLaunchConfig(config: AwsSamDebuggerConfiguration, source?: string): Promise<void> {
        const finalConfig = finalizeConfig(
            resolveWorkspaceFolderVariable(undefined, config),
            'Editor-Created Debug Config'
        )
        const targetUri = await this.getUriFromLaunchConfig(finalConfig)
        const folder = targetUri ? vscode.workspace.getWorkspaceFolder(targetUri) : undefined

        // startDebugging on VS Code goes through the whole resolution chain
        await vscode.debug.startDebugging(folder, finalConfig)
    }
    public async getLaunchConfigQuickPickItems(
        launchConfig: LaunchConfiguration,
        uri: vscode.Uri
    ): Promise<LaunchConfigPickItem[]> {
        const existingConfigs = launchConfig.getDebugConfigurations()
        const samValidator = new DefaultAwsSamDebugConfigurationValidator(vscode.workspace.getWorkspaceFolder(uri))
        const registry = await globals.templateRegistry
        const mapped = existingConfigs.map((val, index) => {
            return {
                config: val as AwsSamDebuggerConfiguration,
                index: index,
                label: val.name,
            }
        })
        // XXX: can't use filter() with async predicate.
        const filtered: LaunchConfigPickItem[] = []
        for (const c of mapped) {
            const valid = await samValidator.validate(c.config, registry, true)
            if (valid?.isValid) {
                filtered.push(c)
            }
        }
        return filtered
    }

    public async getUriFromLaunchConfig(config: AwsSamDebuggerConfiguration): Promise<vscode.Uri | undefined> {
        let targetPath: string
        if (isTemplateTargetProperties(config.invokeTarget)) {
            targetPath = config.invokeTarget.templatePath
        } else if (isCodeTargetProperties(config.invokeTarget)) {
            targetPath = config.invokeTarget.projectRoot
        } else {
            // error
            return undefined
        }
        if (path.isAbsolute(targetPath)) {
            return vscode.Uri.file(targetPath)
        }
        // TODO: rework this logic (and config variables in general)
        // we have too many places where we try to resolve these paths when it realistically can be
        // in a single place. Much less bug-prone when it's centralized.
        // the following line is a quick-fix for a very narrow edge-case
        targetPath = targetPath.replace('${workspaceFolder}/', '')
        const workspaceFolders = vscode.workspace.workspaceFolders || []
        for (const workspaceFolder of workspaceFolders) {
            const absolutePath = tryGetAbsolutePath(workspaceFolder, targetPath)
            if (await fs.exists(absolutePath)) {
                return vscode.Uri.file(absolutePath)
            }
        }

        return undefined
    }
}

const WebviewPanel = VueWebview.compilePanel(SamInvokeWebview)

export function registerSamInvokeVueCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return Commands.register('aws.launchConfigForm', async (launchConfig?: AwsSamDebuggerConfiguration) => {
        const webview = new WebviewPanel(context, launchConfig)
        await telemetry.sam_openConfigUi.run(async (span) => {
            await webview.show({
                title: localize('AWS.command.launchConfigForm.title', 'Local Invoke and Debug Configuration'),
                // TODO: make this only open `Beside` when executed via CodeLens
                viewColumn: vscode.ViewColumn.Beside,
            })
        })
    })
}

export async function registerSamDebugInvokeVueCommand(
    context: vscode.ExtensionContext,
    params: { resource: ResourceNode }
) {
    const resource = params?.resource.resource
    const source = 'AppBuilderLocalInvoke'
    const launchConfigs = await new LaunchConfiguration(resource.location).getSamDebugConfigurations()
    const launchConfig = launchConfigs.find(
        (config) => (config.invokeTarget as TemplateTargetProperties).logicalId === resource.resource.Id
    )

    const webview = new WebviewPanel(context, launchConfig, {
        logicalId: resource.resource.Id ?? '',
        region: resource.region ?? '',
        location: resource.location.fsPath,
        handler: resource.resource.Handler!,
        runtime: launchConfig?.lambda?.runtime ?? resource.resource.Runtime!,
        arn: resource.functionArn ?? '',
        stackName: resource.stackName ?? '',
        environment: resource.resource.Environment,
        source: source,
    })
    await telemetry.sam_openConfigUi.run(async (span) => {
        telemetry.record({ source: 'AppBuilderDebugger' }),
            await webview.show({
                title: localize('AWS.command.launchConfigForm.title', 'Local Invoke and Debug Configuration'),
                // TODO: make this only open `Beside` when executed via CodeLens
                viewColumn: vscode.ViewColumn.Beside,
            })
    })
}

export function finalizeConfig(config: AwsSamDebuggerConfiguration, name: string): AwsSamDebuggerConfiguration {
    const newConfig = doTraverseAndPrune(config)
    newConfig.name = name

    if (isTemplateTargetProperties(config.invokeTarget)) {
        newConfig.invokeTarget = {
            target: config.invokeTarget.target,
            logicalId: config.invokeTarget.logicalId,
            templatePath: config.invokeTarget.templatePath,
        }
    } else if (isCodeTargetProperties(config.invokeTarget)) {
        newConfig.invokeTarget = {
            target: config.invokeTarget.target,
            lambdaHandler: config.invokeTarget.lambdaHandler,
            projectRoot: config.invokeTarget.projectRoot,
        }
    }

    return newConfig
}

/**
 * Removes empty objects, strings, fields, and arrays from a given object.
 * Use when writing JSON to a file.
 * @param object
 * @returns Pruned object
 */
function doTraverseAndPrune(object: { [key: string]: any }): any | undefined {
    const keys = Object.keys(object)
    const final = JSON.parse(JSON.stringify(object))
    for (const key of keys) {
        const val = object[key]
        if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
            delete final[key]
        } else if (typeof val === 'object') {
            const pruned = doTraverseAndPrune(val)
            if (pruned) {
                final[key] = pruned
            } else {
                delete final[key]
            }
        }
    }
    if (Object.keys(final).length === 0) {
        return undefined
    }
    return final
}
