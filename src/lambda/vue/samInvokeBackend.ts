/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { LaunchConfiguration } from '../../shared/debug/launchConfiguration'

import { ExtContext } from '../../shared/extensions'
import { getLogger } from '../../shared/logger'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import {
    AwsSamDebuggerConfiguration,
    isCodeTargetProperties,
    isTemplateTargetProperties,
} from '../../shared/sam/debugger/awsSamDebugConfiguration'
import {
    DefaultAwsSamDebugConfigurationValidator,
    resolveWorkspaceFolderVariable,
} from '../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import * as input from '../../shared/ui/input'
import * as picker from '../../shared/ui/picker'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { compileVueWebview } from '../../webviews/main'
import { sampleRequestPath } from '../constants'
import { tryGetAbsolutePath } from '../../shared/utilities/workspaceUtils'
import { CloudFormation } from '../../shared/cloudformation/cloudformation'
import { openLaunchJsonFile } from '../../shared/sam/debugger/commands/addSamDebugConfiguration'
import { recordSamOpenConfigUi } from '../../shared/telemetry/telemetry.gen'
import { getSampleLambdaPayloads } from '../utils'
import { isCloud9 } from '../../shared/extensionUtilities'
import { SamDebugConfigProvider } from '../../shared/sam/debugger/awsSamDebugger'
import { samLambdaCreatableRuntimes } from '../models/samLambdaRuntime'
import globals from '../../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

const VueWebview = compileVueWebview({
    id: 'createLambda',
    title: localize('AWS.command.launchConfigForm.title', 'SAM Debug Configuration Editor'),
    webviewJs: 'lambdaVue.js',
    commands: {
        getRuntimes: () => samLambdaCreatableRuntimes().toArray().sort(),
        getTemplate,
        getSamplePayload,
        loadSamLaunchConfig,
        saveLaunchConfig,
        invokeLaunchConfig(config: AwsSamDebuggerConfiguration) {
            return invokeLaunchConfig(config, this.context)
        },
    },
    start: (param?: AwsSamDebuggerConfiguration) => param,
})

export class SamInvokeWebview extends VueWebview {}

export function registerSamInvokeVueCommand(context: ExtContext): vscode.Disposable {
    return vscode.commands.registerCommand(
        'aws.launchConfigForm',
        async (launchConfig?: AwsSamDebuggerConfiguration) => {
            new SamInvokeWebview(context).start(launchConfig)
            recordSamOpenConfigUi()
        }
    )
}

export interface AwsSamDebuggerConfigurationLoose extends AwsSamDebuggerConfiguration {
    invokeTarget: {
        target: 'template' | 'api' | 'code'
        templatePath: string
        logicalId: string
        lambdaHandler: string
        projectRoot: string
    }
}

/**
 * Open a quick pick containing the names of launch configs in the `launch.json` array.
 * Filter out non-supported launch configs.
 * Call back into the webview with the selected launch config.
 * @param postMessageFn
 */
async function loadSamLaunchConfig(): Promise<AwsSamDebuggerConfiguration | undefined> {
    // TODO: Find a better way to infer this. Might need another arg from the frontend (depends on the context in which the launch config is made?)
    const workspaceFolder = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0] : undefined
    if (!workspaceFolder) {
        vscode.window.showErrorMessage(localize('AWS.lambda.form.noFolder', 'No workspace folder found.'))
        return
    }
    const uri = workspaceFolder.uri
    const launchConfig = new LaunchConfiguration(uri)
    const pickerItems = getLaunchConfigQuickPickItems(launchConfig, uri)
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

interface SampleQuickPickItem extends vscode.QuickPickItem {
    filename: string
}

/**
 * Open a quick pick containing upstream sample payloads.
 * Call back into the webview with the contents of the payload to add to the JSON field.
 * @param postMessageFn
 */
async function getSamplePayload(): Promise<string | undefined> {
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
async function getTemplate() {
    const items: (vscode.QuickPickItem & { templatePath: string })[] = []
    const NO_TEMPLATE = 'NOTEMPLATEFOUND'
    for (const template of globals.templateRegistry.registeredItems) {
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
            templatePath: NO_TEMPLATE,
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

    if (!selectedTemplate || selectedTemplate.templatePath === NO_TEMPLATE) {
        return
    }

    return {
        logicalId: selectedTemplate.label,
        template: selectedTemplate.templatePath,
    }
}

interface LaunchConfigPickItem extends vscode.QuickPickItem {
    index: number
    config?: AwsSamDebuggerConfiguration
}

/**
 * Open a quick pick containing the names of launch configs in the `launch.json` array, plus a "Create New Entry" entry.
 * On selecting a name, overwrite the existing entry in the `launch.json` array and resave the file.
 * On selecting "Create New Entry", prompt the user for a name and save the contents to the end of the `launch.json` array.
 * @param config Config to save
 */
async function saveLaunchConfig(config: AwsSamDebuggerConfiguration): Promise<void> {
    const uri = getUriFromLaunchConfig(config)
    if (!uri) {
        // TODO Localize
        vscode.window.showErrorMessage('Toolkit requires a target resource in order to save a debug configuration')
        return
    }
    const launchConfig = new LaunchConfiguration(uri)
    const pickerItems = [
        {
            label: addCodiconToString(
                'add',
                localize('AWS.command.addSamDebugConfiguration', 'Add Debug Configuration')
            ),
            index: -1,
            alwaysShow: true,
        },
        ...getLaunchConfigQuickPickItems(launchConfig, uri),
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
            launchConfig.addDebugConfiguration(finalizeConfig(config, response))
            await openLaunchJsonFile()
        }
    } else {
        // use existing label
        launchConfig.editDebugConfiguration(finalizeConfig(config, pickerResponse.label), pickerResponse.index)
        await openLaunchJsonFile()
    }
}

/**
 * Validate and execute the provided launch config.
 * TODO: Post validation failures back to webview?
 * @param config Config to invoke
 */
async function invokeLaunchConfig(config: AwsSamDebuggerConfiguration, context: ExtContext): Promise<void> {
    const finalConfig = finalizeConfig(resolveWorkspaceFolderVariable(undefined, config), 'Editor-Created Debug Config')
    const targetUri = getUriFromLaunchConfig(finalConfig)
    const folder = targetUri ? vscode.workspace.getWorkspaceFolder(targetUri) : undefined

    // Cloud9 currently can't resolve the `aws-sam` debug config provider.
    // Directly invoke the config instead.
    // NOTE: This bypasses the `${workspaceFolder}` resolution, but shouldn't naturally occur in Cloud9
    // (Cloud9 also doesn't currently have variable resolution support anyways)
    if (isCloud9()) {
        const provider = new SamDebugConfigProvider(context)
        await provider.resolveDebugConfiguration(folder, finalConfig)
    } else {
        // startDebugging on VS Code goes through the whole resolution chain
        await vscode.debug.startDebugging(folder, finalConfig)
    }
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

function getLaunchConfigQuickPickItems(launchConfig: LaunchConfiguration, uri: vscode.Uri): LaunchConfigPickItem[] {
    const existingConfigs = launchConfig.getDebugConfigurations()
    const samValidator = new DefaultAwsSamDebugConfigurationValidator(vscode.workspace.getWorkspaceFolder(uri))
    return existingConfigs
        .map((val, index) => {
            return {
                config: val,
                index,
            }
        })
        .filter(o => samValidator.validate(o.config as any as AwsSamDebuggerConfiguration, true)?.isValid)
        .map(val => {
            return {
                index: val.index,
                label: val.config.name,
                config: val.config as AwsSamDebuggerConfiguration,
            }
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
