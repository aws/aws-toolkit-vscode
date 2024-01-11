/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as CloudFormation from '../../shared/cloudformation/cloudformation'
import {
    AwsSamDebuggerConfiguration,
    awsSamDebugTargetTypes,
    CodeTargetProperties,
    TemplateTargetProperties,
} from '../../shared/sam/debugger/awsSamDebugConfiguration'
import * as pathutil from '../../shared/utilities/pathUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { tryGetAbsolutePath } from '../../shared/utilities/workspaceUtils'
import { Architecture, RuntimeFamily } from '../models/samLambdaRuntime'
import { SamLaunchRequestArgs } from '../../shared/sam/debugger/awsSamDebugger'

import { getLogger } from '../../shared/logger'
import globals from '../../shared/extensionGlobals'

/**
 * Magic path on the Docker image.
 * https://github.com/aws/aws-sam-cli/blob/2201b17bff0a438b934abbb53f6c76eff9ccfa6d/samcli/local/docker/lambda_container.py#L25
 */
export const dotnetDebuggerPath = '/tmp/lambci_debug_files/vsdbg'
export const goDebuggerPath = '/tmp/lambci_debug_files'

export interface NodejsDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.NodeJS
    readonly preLaunchTask?: string
    readonly address: 'localhost'
    readonly localRoot: string
    readonly remoteRoot: string
    readonly skipFiles?: string[]
    readonly port: number
}

export interface PythonPathMapping {
    localRoot: string
    remoteRoot: string
}

export interface PythonDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.Python
    /** Passed to "sam build --manifest …" */
    readonly manifestPath: string | undefined

    // Fields expected by the VSCode debugpy adapter.
    readonly host: string
    readonly port: number
    readonly pathMappings: PythonPathMapping[]
}

/** Alternative (Cloud9) Python debugger: ikp3db */
export interface PythonCloud9DebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.Python
    /** Passed to "sam build --manifest …" */
    readonly manifestPath: string | undefined

    // Fields expected by the Cloud9 debug adapter.
    // (Cloud9 sourcefile: debugger-vscode-mainthread-adapter.ts)
    readonly port: number
    readonly address: string
    readonly localRoot: string
    readonly remoteRoot: string
}

export interface DotNetDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.DotNet
    processName: string
    pipeTransport: PipeTransport
    windows: {
        pipeTransport: PipeTransport
    }
    sourceFileMap?: {
        [key: string]: string
    }
}

export interface GoDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.Go
    readonly preLaunchTask?: string
    readonly host: 'localhost'
    readonly port: number
}

export interface PipeTransport {
    pipeProgram: 'sh' | 'powershell'
    pipeArgs: string[]
    debuggerPath: typeof dotnetDebuggerPath
    pipeCwd: string
}

/**
 * Gets the "code root" as an absolute path.
 *
 * - For "code" configs this is the `projectRoot` field.
 * - For "template" configs this is the `CodeUri` field in the template.
 */
export async function getCodeRoot(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration
): Promise<string | undefined> {
    switch (config.invokeTarget.target) {
        case 'code': {
            const codeInvoke = config.invokeTarget as CodeTargetProperties
            return pathutil.normalize(tryGetAbsolutePath(folder, codeInvoke.projectRoot))
        }
        case 'api':
        case 'template': {
            const templateInvoke = config.invokeTarget as TemplateTargetProperties
            const template = await getTemplate(folder, config)
            if (!template) {
                return undefined
            }
            const templateResource = await getTemplateResource(folder, config)
            if (!templateResource?.Properties) {
                return undefined
            }
            const fullPath = tryGetAbsolutePath(folder, templateInvoke.templatePath)
            const templateDir = path.dirname(fullPath)
            // Image lambda or ZIP lambda?
            const isImageLambda = CloudFormation.isImageLambdaResource(templateResource.Properties)
            const uri = isImageLambda
                ? CloudFormation.getStringForProperty(templateResource?.Metadata, 'DockerContext', template)
                : CloudFormation.getStringForProperty(
                      templateResource.Properties as CloudFormation.ZipResourceProperties,
                      'CodeUri',
                      template
                  )
            return uri !== undefined ? pathutil.normalize(path.resolve(templateDir ?? '', uri)) : undefined
        }
        default: {
            throw Error('invalid invokeTarget') // Must not happen.
        }
    }
}

/**
 * Gets the lambda handler name specified in the given config.
 */
export async function getHandlerName(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration
): Promise<string> {
    switch (config.invokeTarget.target) {
        case 'code': {
            const codeInvoke = config.invokeTarget as CodeTargetProperties
            return codeInvoke.lambdaHandler
        }
        case 'api':
        case 'template': {
            const template = await getTemplate(folder, config)
            if (!template) {
                return ''
            }
            const templateResource = await getTemplateResource(folder, config)
            if (CloudFormation.isImageLambdaResource(templateResource?.Properties)) {
                return config.invokeTarget.logicalId
            }

            const propertyValue = CloudFormation.resolvePropertyWithOverrides(
                templateResource?.Properties?.Handler,
                template,
                config.sam?.template?.parameters
            )
            return propertyValue ? propertyValue.toString() : ''
        }
        default: {
            // Should never happen.
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.sam.debugger.invalidTarget',
                    'Debug Configuration has an unsupported target type. Supported types: {0}',
                    awsSamDebugTargetTypes.join(', ')
                )
            )
            return ''
        }
    }
}

/** Gets a template object from the given config. */
export async function getTemplate(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration
): Promise<CloudFormation.Template | undefined> {
    if (!['api', 'template'].includes(config.invokeTarget.target)) {
        return undefined
    }
    const templateInvoke = config.invokeTarget as TemplateTargetProperties
    const fullPath = tryGetAbsolutePath(folder, templateInvoke.templatePath)
    const cfnTemplate = (await globals.templateRegistry).getItem(fullPath)?.item
    return cfnTemplate
}

/**
 * Gets the template resources object specified by the `logicalId`
 * field (if the config has `target=template` or `target=api`).
 */
export async function getTemplateResource(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration
): Promise<CloudFormation.Resource | undefined> {
    if (!['api', 'template'].includes(config.invokeTarget.target)) {
        return undefined
    }
    const templateInvoke = config.invokeTarget as TemplateTargetProperties
    const cfnTemplate = await getTemplate(folder, config)
    if (!cfnTemplate) {
        throw Error(`template not found (not registered?): ${templateInvoke.templatePath}`)
    }
    if (!cfnTemplate?.Resources) {
        throw Error(`no Resources in template: ${templateInvoke.templatePath}`)
    }
    const templateResource: CloudFormation.Resource | undefined = cfnTemplate?.Resources![templateInvoke.logicalId!]
    if (!templateResource) {
        throw Error(
            `template Resources object does not contain key '${templateInvoke.logicalId}':` +
                ` ${JSON.stringify(cfnTemplate?.Resources)}`
        )
    }
    return templateResource
}

/**
 * Checks if the current configuration is based on an Image-based template.
 *
 * Intended for use only by the language-specific `makeConfig` functions.
 */
export async function isImageLambdaConfig(config: SamLaunchRequestArgs): Promise<boolean> {
    const templateResource = await getTemplateResource(config.workspaceFolder, config)

    return CloudFormation.isImageLambdaResource(templateResource?.Properties)
}

export function getArchitecture(
    template: CloudFormation.Template | undefined,
    resource: CloudFormation.Resource | undefined,
    invokeTarget: AwsSamDebuggerConfiguration['invokeTarget']
): Architecture | undefined {
    let arch: string | undefined
    let architectureLocation: string
    if (template) {
        arch = (CloudFormation.getArrayForProperty(resource?.Properties, 'Architectures', template) ?? [])[0]
        architectureLocation = localize('AWS.generic.template', 'template file')
    } else {
        arch = (invokeTarget as CodeTargetProperties)?.architecture
        architectureLocation = localize('AWS.generic.launchConfig', 'launch configuration')
    }

    if (arch) {
        const isArch = isArchitecture(arch)

        if (!isArch) {
            getLogger('channel').warn('SAM Invoke: Invalid architecture. Defaulting to x86_64.')
            void vscode.window.showWarningMessage(
                localize(
                    'AWS.output.sam.invalidArchitecture',
                    'Invalid architecture specified in {0}. Defaulting to x86_64 architecture for invocation.',
                    architectureLocation
                )
            )
            arch = 'x86_64'
        }

        return arch as Architecture
    }
}

function isArchitecture(a: any): a is Architecture {
    return ['x86_64', 'arm64'].includes(a)
}
