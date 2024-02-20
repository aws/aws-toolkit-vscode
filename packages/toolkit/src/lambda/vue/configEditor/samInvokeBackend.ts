/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { LaunchConfiguration } from '../../../shared/debug/launchConfiguration'

import { ExtContext } from '../../../shared/extensions'
import { getLogger } from '../../../shared/logger'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import {
    AwsSamDebuggerConfiguration,
    isCodeTargetProperties,
    isTemplateTargetProperties,
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
import { isCloud9 } from '../../../shared/extensionUtilities'
import { SamDebugConfigProvider } from '../../../shared/sam/debugger/awsSamDebugger'
import { samLambdaCreatableRuntimes } from '../../models/samLambdaRuntime'
import globals from '../../../shared/extensionGlobals'
import { VueWebview } from '../../../webviews/main'
import { Commands } from '../../../shared/vscode/commands2'
import { telemetry } from '../../../shared/telemetry/telemetry'

const localize = nls.loadMessageBundle()

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

interface LaunchConfigPickItem extends vscode.QuickPickItem {
    index: number
    config?: AwsSamDebuggerConfiguration
}

export class SamInvokeWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/lambda/vue/configEditor/index.js'
    public readonly id = 'createLambda'

    public constructor(
        private readonly extContext: ExtContext, // TODO(sijaden): get rid of `ExtContext`
        private readonly config?: AwsSamDebuggerConfiguration
    ) {
        super(SamInvokeWebview.sourcePath)
    }

    public getRuntimes() {
        return samLambdaCreatableRuntimes().toArray().sort()
    }

    public init() {
        return this.config
    }

    /**
     * Open a quick pick containing the names of launch configs in the `launch.json` array.
     * Filter out non-supported launch configs.
     */
    public async loadSamLaunchConfig(): Promise<AwsSamDebuggerConfiguration | undefined> {
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
        const pickerItems = await getLaunchConfigQuickPickItems(launchConfig, uri)
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
            const inputs: SampleQuickPickItem[] = (await getSampleLambdaPayloads()).map(entry => {
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
            const sample = (await new HttpResourceFetcher(sampleUrl, { showUrl: true }).get()) ?? ''

            return sample
        } catch (err) {
            getLogger().error('Error getting manifest data..: %O', err as Error)
        }
    }

    /**
     * Get all templates in the registry.
     * Call back into the webview with the registry contents.
     */
    public async getTemplate() {
        const items: (vscode.QuickPickItem & { templatePath: string })[] = []
        const noTemplate = 'NOTEMPLATEFOUND'
        for (const template of (await globals.templateRegistry).items) {
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

    /**
     * Open a quick pick containing the names of launch configs in the `launch.json` array, plus a "Create New Entry" entry.
     * On selecting a name, overwrite the existing entry in the `launch.json` array and resave the file.
     * On selecting "Create New Entry", prompt the user for a name and save the contents to the end of the `launch.json` array.
     * @param config Config to save
     */
    public async saveLaunchConfig(config: AwsSamDebuggerConfiguration): Promise<void> {
        const uri = getUriFromLaunchConfig(config)
        if (!uri) {
            // TODO Localize
            void vscode.window.showErrorMessage(
                'Toolkit requires a target resource in order to save a debug configuration'
            )
            return
        }
        const launchConfig = new LaunchConfiguration(uri)
        const launchConfigItems = await getLaunchConfigQuickPickItems(launchConfig, uri)
        const pickerItems = [
            {
                label: addCodiconToString(
                    'add',
                    localize('AWS.command.addSamDebugConfiguration', 'Add Debug Configuration')
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
                await openLaunchJsonFile()
            }
        } else {
            // use existing label
            await launchConfig.editDebugConfiguration(
                finalizeConfig(config, pickerResponse.label),
                pickerResponse.index
            )
            await openLaunchJsonFile()
        }
    }

    /**
     * Validate and execute the provided launch config.
     * TODO: Post validation failures back to webview?
     * @param config Config to invoke
     */
    public async invokeLaunchConfig(config: AwsSamDebuggerConfiguration): Promise<void> {
        const finalConfig = finalizeConfig(
            resolveWorkspaceFolderVariable(undefined, config),
            'Editor-Created Debug Config'
        )
        const targetUri = getUriFromLaunchConfig(finalConfig)
        const folder = targetUri ? vscode.workspace.getWorkspaceFolder(targetUri) : undefined

        // Cloud9 currently can't resolve the `aws-sam` debug config provider.
        // Directly invoke the config instead.
        // NOTE: This bypasses the `${workspaceFolder}` resolution, but shouldn't naturally occur in Cloud9
        // (Cloud9 also doesn't currently have variable resolution support anyways)
        if (isCloud9()) {
            const provider = new SamDebugConfigProvider(this.extContext)
            await provider.resolveDebugConfiguration(folder, finalConfig)
        } else {
            // startDebugging on VS Code goes through the whole resolution chain
            await vscode.debug.startDebugging(folder, finalConfig)
        }
    }
}

const WebviewPanel = VueWebview.compilePanel(SamInvokeWebview)

export function registerSamInvokeVueCommand(context: ExtContext): vscode.Disposable {
    return Commands.register('aws.launchConfigForm', async (launchConfig?: AwsSamDebuggerConfiguration) => {
        const webview = new WebviewPanel(context.extensionContext, context, launchConfig)
        await telemetry.sam_openConfigUi.run(async span => {
            await webview.show({
                title: localize('AWS.command.launchConfigForm.title', 'Edit SAM Debug Configuration'),
                // TODO: make this only open `Beside` when executed via CodeLens
                viewColumn: vscode.ViewColumn.Beside,
            })
        })
    })
}

function getUriFromLaunchConfig(config: AwsSamDebuggerConfiguration): vscode.Uri | undefined {
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
        if (fs.pathExistsSync(absolutePath)) {
            return vscode.Uri.file(absolutePath)
        }
    }

    return undefined
}

async function getLaunchConfigQuickPickItems(
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
