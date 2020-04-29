/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { SamLaunchRequestArgs } from '../../shared/sam/debugger/samDebugSession'
import { RuntimeFamily } from '../models/samLambdaRuntime'
import {
    CodeTargetProperties,
    TemplateTargetProperties,
    AwsSamDebuggerConfiguration,
    AWS_SAM_DEBUG_TARGET_TYPES,
} from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { tryGetAbsolutePath } from '../../shared/utilities/workspaceUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { CloudFormation } from '../../shared/cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../shared/cloudformation/templateRegistry'
import * as pathutil from '../../shared/utilities/pathUtils'

export const DOTNET_CORE_DEBUGGER_PATH = '/tmp/lambci_debug_files/vsdbg'

export interface NodejsDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.NodeJS
    readonly preLaunchTask?: string
    readonly address: 'localhost'
    readonly localRoot: string
    readonly remoteRoot: '/var/task'
    readonly skipFiles?: string[]
    readonly port: number
}

export interface PythonPathMapping {
    localRoot: string
    remoteRoot: string
}

export interface PythonDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.Python
    readonly host: string
    // TODO: remove, use `debugPort` instead?
    readonly port: number
    readonly pathMappings: PythonPathMapping[]
    readonly manifestPath: string
}

export interface DotNetCoreDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.DotNetCore
    processId: string
    pipeTransport: PipeTransport
    windows: {
        pipeTransport: PipeTransport
    }
    sourceFileMap: {
        [key: string]: string
    }
}

export interface PipeTransport {
    pipeProgram: 'sh' | 'powershell'
    pipeArgs: string[]
    debuggerPath: typeof DOTNET_CORE_DEBUGGER_PATH
    pipeCwd: string
}

export function assertTargetKind(config: SamLaunchRequestArgs, expectedTarget: 'code' | 'template'): void {
    if (config.invokeTarget.target !== expectedTarget) {
        throw Error(
            `SAM debug: invalid config (expected target: ${expectedTarget}): ${JSON.stringify(config, undefined, 2)}`
        )
    }
}

export function getCodeRoot(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration
): string | undefined {
    switch (config.invokeTarget.target) {
        case 'code': {
            const codeInvoke = config.invokeTarget as CodeTargetProperties
            return pathutil.normalize(tryGetAbsolutePath(folder, codeInvoke.projectRoot))
        }
        case 'template': {
            const templateInvoke = config.invokeTarget as TemplateTargetProperties
            const templateResource = getTemplateResource(config)
            if (!templateResource?.Properties) {
                return undefined
            }
            const templateDir = path.dirname(templateInvoke.samTemplatePath)
            return pathutil.normalize(path.resolve(templateDir ?? '', templateResource?.Properties?.CodeUri))
        }
        default: {
            throw Error('invalid invokeTarget') // Must not happen.
        }
    }
}

export function getHandlerName(config: AwsSamDebuggerConfiguration): string {
    switch (config.invokeTarget.target) {
        case 'code': {
            const codeInvoke = config.invokeTarget as CodeTargetProperties
            return codeInvoke.lambdaHandler
        }
        case 'template': {
            const templateResource = getTemplateResource(config)
            return templateResource?.Properties?.Handler!!
        }
        default: {
            // Should never happen.
            vscode.window.showErrorMessage(
                localize(
                    'AWS.sam.debugger.invalidTarget',
                    'Debug Configuration has an unsupported target type. Supported types: {0}',
                    AWS_SAM_DEBUG_TARGET_TYPES.join(', ')
                )
            )
            return ''
        }
    }
}

export function getTemplate(config: AwsSamDebuggerConfiguration): CloudFormation.Template | undefined {
    if (config.invokeTarget.target !== 'template') {
        return undefined
    }
    const templateInvoke = config.invokeTarget as TemplateTargetProperties
    const cftRegistry = CloudFormationTemplateRegistry.getRegistry()
    const cfnTemplate = cftRegistry.getRegisteredTemplate(templateInvoke.samTemplatePath)?.template
    return cfnTemplate
}

export function getTemplateResource(config: AwsSamDebuggerConfiguration): CloudFormation.Resource | undefined {
    if (config.invokeTarget.target !== 'template') {
        return undefined
    }
    const templateInvoke = config.invokeTarget as TemplateTargetProperties
    const cfnTemplate = getTemplate(config)
    if (!cfnTemplate) {
        throw Error(`template not found (not registered?): ${templateInvoke.samTemplatePath}`)
    }
    if (!cfnTemplate?.Resources) {
        throw Error(`no Resources in template: ${templateInvoke.samTemplatePath}`)
    }
    const templateResource: CloudFormation.Resource | undefined = cfnTemplate?.Resources![
        templateInvoke.samTemplateResource!!
    ]
    if (!templateResource) {
        throw Error(
            `template Resources object does not contain key '${templateInvoke.samTemplateResource}':` +
                ` ${JSON.stringify(cfnTemplate?.Resources)}`
        )
    }
    return templateResource
}
