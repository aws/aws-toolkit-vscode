/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import _ = require('lodash')
import xml2js = require('xml2js')
import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { LaunchConfiguration } from '../../shared/debug/launchConfiguration'
import { ext } from '../../shared/extensionGlobals'
import { ExtContext } from '../../shared/extensions'
import { getLogger } from '../../shared/logger'
import { CompositeResourceFetcher } from '../../shared/resourcefetcher/compositeResourceFetcher'
import { FileResourceFetcher } from '../../shared/resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import { ResourceFetcher } from '../../shared/resourcefetcher/resourcefetcher'
import {
    AwsSamDebuggerConfiguration,
    isCodeTargetProperties,
    isTemplateTargetProperties,
} from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { DefaultAwsSamDebugConfigurationValidator } from '../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import { SamDebugConfigProvider } from '../../shared/sam/debugger/awsSamDebugger'
import * as input from '../../shared/ui/input'
import * as picker from '../../shared/ui/picker'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { createVueWebview } from '../../webviews/main'
import { sampleRequestManifestPath, sampleRequestPath } from '../constants'
import { tryGetAbsolutePath } from '../../shared/utilities/workspaceUtils'
import { CloudFormation } from '../../shared/cloudformation/cloudformation'
import { openLaunchJsonFile } from '../../shared/sam/debugger/commands/addSamDebugConfiguration'

const localize = nls.loadMessageBundle()

export function registerSamInvokeVueCommand(context: ExtContext): vscode.Disposable {
    return vscode.commands.registerCommand(
        'aws.lambda.invokeForm',
        async (launchConfig?: AwsSamDebuggerConfiguration) => {
            await createVueWebview<SamInvokerRequest, SamInvokerResponse>({
                id: 'createLambda',
                name: localize('AWS.command.lambda.invokeform', 'Invoke Local SAM Application'),
                webviewJs: 'samInvokeVue.js',
                onDidReceiveMessageFunction: async (message, postMessageFn, destroyWebviewFn) =>
                    handleFrontendToBackendMessage(message, postMessageFn, destroyWebviewFn, context),
                context: context.extensionContext,
                cssFiles: ['samInvokeForm.css'],
                initialCalls: launchConfig
                    ? [
                          {
                              command: 'loadSamLaunchConfig',
                              data: {
                                  launchConfig: launchConfig,
                              },
                          },
                      ]
                    : undefined,
            })
        }
    )
}

export interface SamInvokeVueState {
    launchConfig: MorePermissiveAwsSamDebuggerConfiguration
    payload: string
}

export interface MorePermissiveAwsSamDebuggerConfiguration extends AwsSamDebuggerConfiguration {
    invokeTarget: {
        target: 'template' | 'api' | 'code'
        templatePath: string
        logicalId: string
        lambdaHandler: string
        projectRoot: string
    }
}

export interface LoadSamLaunchConfigResponse {
    command: 'loadSamLaunchConfig'
    data: {
        launchConfig: AwsSamDebuggerConfiguration
    }
}

export interface GetSamplePayloadResponse {
    command: 'getSamplePayload'
    data: {
        payload: string
    }
}

export interface GetTemplateResponse {
    command: 'getTemplate'
    data: {
        template: string
        logicalId: string
    }
}

export interface SamInvokerBasicRequest {
    command: 'loadSamLaunchConfig' | 'getSamplePayload' | 'getTemplate'
}

export interface SamInvokerLaunchRequest {
    command: 'saveLaunchConfig' | 'invokeLaunchConfig'
    data: {
        launchConfig: AwsSamDebuggerConfiguration
    }
}

export type SamInvokerRequest = SamInvokerBasicRequest | SamInvokerLaunchRequest
export type SamInvokerResponse = LoadSamLaunchConfigResponse | GetSamplePayloadResponse | GetTemplateResponse

async function handleFrontendToBackendMessage(
    message: SamInvokerRequest,
    postMessageFn: (response: SamInvokerResponse) => Thenable<boolean>,
    destroyWebviewFn: () => any,
    context: ExtContext
): Promise<any> {
    switch (message.command) {
        case 'loadSamLaunchConfig':
            loadSamLaunchConfig(postMessageFn)
            break
        case 'getSamplePayload':
            getSamplePayload(postMessageFn)
            break
        case 'getTemplate':
            getTemplate(postMessageFn)
            break
        case 'saveLaunchConfig':
            saveLaunchConfig(message.data.launchConfig)
            break
        case 'invokeLaunchConfig':
            invokeLaunchConfig(message.data.launchConfig, context)
            break
    }
}

/**
 * Open a quick pick containing the names of launch configs in the `launch.json` array.
 * Filter out non-supported launch configs.
 * Call back into the webview with the selected launch config.
 * @param postMessageFn
 */
async function loadSamLaunchConfig(postMessageFn: (response: SamInvokerResponse) => Thenable<boolean>): Promise<void> {
    // TODO: Find a better way to infer this. Might need another arg from the frontend (depends on the context in which the launch config is made?)
    const workspaceFolder = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0] : undefined
    if (!workspaceFolder) {
        // TODO Localize
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
    postMessageFn({
        command: 'loadSamLaunchConfig',
        data: {
            launchConfig: pickerResponse.config!,
        },
    })
}

interface SampleRequestManifest {
    requests: {
        request: {
            name?: string
            filename?: string
        }[]
    }
}

interface SampleQuickPickItem extends vscode.QuickPickItem {
    filename: string
}

/**
 * Open a quick pick containing upstream sample payloads.
 * Call back into the webview with the contents of the payload to add to the JSON field.
 * @param postMessageFn
 */
async function getSamplePayload(postMessageFn: (response: SamInvokerResponse) => Thenable<boolean>): Promise<void> {
    // stolen from invokeLambda.ts
    try {
        const sampleInput = await makeSampleRequestManifestResourceFetcher().get()

        if (!sampleInput) {
            throw new Error('Unable to retrieve Sample Request manifest')
        }

        getLogger().debug(`Loaded: ${sampleInput}`)

        const inputs: SampleQuickPickItem[] = []

        await new Promise<void>((resolve, reject) => {
            xml2js.parseString(sampleInput, { explicitArray: false }, (err: Error, result: SampleRequestManifest) => {
                if (err) {
                    reject()
                }

                _.forEach(result.requests.request, r => {
                    inputs.push({ label: r.name ?? '', filename: r.filename ?? '' })
                })
                resolve()
            })
        })

        const qp = picker.createQuickPick({
            items: inputs,
            options: {
                title: localize('AWS.lambda.form.pickSampleInput', 'Pick a Sample Input'),
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
        // declaring here so we don't get an error
        sample

        postMessageFn({
            command: 'getSamplePayload',
            data: {
                payload: sample,
            },
        })
    } catch (err) {
        getLogger().error('Error getting manifest data..: %O', err as Error)
    }
}

/**
 * Get all templates in the registry.
 * Call back into the webview with the registry contents.
 * @param postMessageFn
 */
async function getTemplate(postMessageFn: (response: SamInvokerResponse) => Thenable<boolean>): Promise<void> {
    const items: (vscode.QuickPickItem & { templatePath: string })[] = []
    const NO_TEMPLATE = 'NOTEMPLATEFOUND'
    for (const template of ext.templateRegistry.registeredItems) {
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

    postMessageFn({
        command: 'getTemplate',
        data: {
            logicalId: selectedTemplate.label,
            template: selectedTemplate.templatePath,
        },
    })
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
    const pickerItems = getLaunchConfigQuickPickItems(launchConfig, uri)

    pickerItems.unshift({
        label: addCodiconToString('add', localize('AWS.command.addSamDebugConfiguration', 'Add Debug Configuration')),
        index: -1,
    })

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

    // Recast invoke targets to undo the MorePermissiveAwsSamDebuggerConfiguration.
    if (isTemplateTargetProperties(config.invokeTarget)) {
        config.invokeTarget = {
            target: config.invokeTarget.target,
            logicalId: config.invokeTarget.logicalId,
            templatePath: config.invokeTarget.templatePath,
        }
    } else if (isCodeTargetProperties(config.invokeTarget)) {
        config.invokeTarget = {
            target: config.invokeTarget.target,
            lambdaHandler: config.invokeTarget.lambdaHandler,
            projectRoot: config.invokeTarget.projectRoot,
        }
    }

    if (pickerResponse.index === -1) {
        const ib = input.createInputBox({
            options: {
                prompt: localize('AWS.lambda.form.debugConfigName', 'Enter Name For Debug Configuration'),
            },
        })
        const response = await input.promptUser({ inputBox: ib })
        if (response) {
            launchConfig.addDebugConfiguration({
                ...config,
                name: response,
            })
        }
    } else {
        // use existing label
        launchConfig.editDebugConfiguration(
            {
                ...config,
                name: pickerResponse.label,
            },
            pickerResponse.index
        )
    }
    await openLaunchJsonFile()
}

/**
 * Validate and execute the provided launch config.
 * TODO: Post validation failures back to webview?
 * @param config Config to invoke
 */
async function invokeLaunchConfig(config: AwsSamDebuggerConfiguration, context: ExtContext): Promise<void> {
    const targetUri = getUriFromLaunchConfig(config)

    const folder = targetUri ? vscode.workspace.getWorkspaceFolder(targetUri) : undefined

    await new SamDebugConfigProvider(context).resolveDebugConfiguration(folder, config)
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
    const workspaceFolders = vscode.workspace.workspaceFolders || []
    for (const workspaceFolder of workspaceFolders) {
        const absolutePath = tryGetAbsolutePath(workspaceFolder, targetPath)
        if (fs.pathExistsSync(absolutePath)) {
            return vscode.Uri.file(absolutePath)
        }
    }

    return undefined
}

function makeSampleRequestManifestResourceFetcher(): ResourceFetcher {
    return new CompositeResourceFetcher(
        new HttpResourceFetcher(sampleRequestManifestPath, { showUrl: true }),
        new FileResourceFetcher(ext.manifestPaths.lambdaSampleRequests)
    )
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
        .filter(o => samValidator.validate((o.config as any) as AwsSamDebuggerConfiguration)?.isValid)
        .map(val => {
            return {
                index: val.index,
                label: val.config.name,
                config: val.config as AwsSamDebuggerConfiguration,
            }
        })
}
