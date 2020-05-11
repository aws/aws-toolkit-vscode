/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getDefaultRuntime, RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { getNormalizedRelativePath } from '../../utilities/pathUtils'
import {
    AwsSamDebuggerConfiguration,
    CodeTargetProperties,
    TemplateTargetProperties,
} from './awsSamDebugConfiguration.gen'

export * from './awsSamDebugConfiguration.gen'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam'
export const DIRECT_INVOKE_TYPE = 'direct-invoke'
export const TEMPLATE_TARGET_TYPE: 'template' = 'template'
export const CODE_TARGET_TYPE: 'code' = 'code'
export const AWS_SAM_DEBUG_REQUEST_TYPES = [DIRECT_INVOKE_TYPE]
export const AWS_SAM_DEBUG_TARGET_TYPES = [TEMPLATE_TARGET_TYPE, CODE_TARGET_TYPE]

export type TargetProperties = AwsSamDebuggerConfiguration['invokeTarget']

export interface ReadonlyJsonObject {
    readonly [key: string]: string | number | boolean
}

export function isAwsSamDebugConfiguration(config: vscode.DebugConfiguration): config is AwsSamDebuggerConfiguration {
    return config.type === AWS_SAM_DEBUG_TYPE
}

export function isTemplateTargetProperties(props: TargetProperties): props is TemplateTargetProperties {
    return props.target === TEMPLATE_TARGET_TYPE
}

export function isCodeTargetProperties(props: TargetProperties): props is CodeTargetProperties {
    return props.target === CODE_TARGET_TYPE
}

/**
 * Creates a description for a SAM debugconfig entry (in launch.json).
 *
 * Example: `makeName('foo', '/bar/baz', 'zub')` => `"baz:foo (zub)"
 *
 * @param primaryName
 * @param parentDir  Optional directory name (used as a prefix)
 * @param suffix  Optional info used to differentiate the name
 */
function makeName(primaryName: string, parentDir: string | undefined, suffix: string | undefined) {
    const withPrefix = parentDir ? `${parentDir}:${primaryName}` : primaryName
    return suffix ? `${withPrefix} (${suffix})` : withPrefix
}

/**
 *
 * @param folder
 * @param runtimeName  Optional runtime name used to enhance the config name
 * @param resourceName
 * @param templatePath
 * @param preloadedConfig
 */
export function createTemplateAwsSamDebugConfig(
    folder: vscode.WorkspaceFolder | undefined,
    runtimeName: string | undefined,
    resourceName: string,
    templatePath: string,
    preloadedConfig?: {
        eventJson?: ReadonlyJsonObject
        environmentVariables?: ReadonlyJsonObject
        dockerNetwork?: string
        useContainer?: boolean
    }
): AwsSamDebuggerConfiguration {
    const workspaceRelativePath = folder ? getNormalizedRelativePath(folder.uri.fsPath, templatePath) : templatePath
    const templateParentDir = path.basename(path.dirname(templatePath))

    const response: AwsSamDebuggerConfiguration = {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: makeName(resourceName, templateParentDir, runtimeName),
        invokeTarget: {
            target: TEMPLATE_TARGET_TYPE,
            samTemplatePath: workspaceRelativePath,
            samTemplateResource: resourceName,
        },
    }

    if (preloadedConfig) {
        return {
            ...response,
            lambda:
                preloadedConfig.environmentVariables || preloadedConfig.eventJson
                    ? {
                          event: preloadedConfig.eventJson
                              ? {
                                    json: preloadedConfig.eventJson,
                                }
                              : undefined,
                          environmentVariables: preloadedConfig.environmentVariables,
                      }
                    : undefined,
            sam:
                preloadedConfig.dockerNetwork || preloadedConfig.useContainer
                    ? {
                          dockerNetwork: preloadedConfig.dockerNetwork,
                          containerBuild: preloadedConfig.useContainer,
                      }
                    : undefined,
        }
    }

    return response
}

export function createCodeAwsSamDebugConfig(
    folder: vscode.WorkspaceFolder | undefined,
    lambdaHandler: string,
    projectRoot: string,
    runtimeFamily?: RuntimeFamily
): AwsSamDebuggerConfiguration {
    const workspaceRelativePath = folder ? getNormalizedRelativePath(folder.uri.fsPath, projectRoot) : projectRoot
    const runtime = runtimeFamily ? getDefaultRuntime(runtimeFamily) : undefined
    if (!runtime) {
        throw new Error('Invalid or missing runtime family')
    }

    return {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: makeName(lambdaHandler, projectRoot, runtime),
        invokeTarget: {
            target: CODE_TARGET_TYPE,
            projectRoot: workspaceRelativePath,
            lambdaHandler: lambdaHandler,
        },
        lambda: {
            runtime,
        },
    }
}
