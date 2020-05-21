/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { Runtime } from 'aws-sdk/clients/lambda'
import { getNormalizedRelativePath } from '../../utilities/pathUtils'
import {
    AwsSamDebuggerConfiguration,
    CodeTargetProperties,
    TemplateTargetProperties,
} from './awsSamDebugConfiguration.gen'
import { getLogger } from '../../logger'

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
 * Ensures that the `projectRoot` or `samTemplatePath` relative properties on
 * the given `config` are relative (not absolute) paths.
 *
 * @param folder  Workspace folder, or empty to use the workspace associated with `projectRoot` or `samTemplatePath`.
 * @param config
 */
export function ensureRelativePaths(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration
): void {
    if (config.invokeTarget.target !== TEMPLATE_TARGET_TYPE && config.invokeTarget.target !== CODE_TARGET_TYPE) {
        throw Error()
    }
    const filepath =
        config.invokeTarget.target === TEMPLATE_TARGET_TYPE
            ? config.invokeTarget.samTemplatePath
            : config.invokeTarget.projectRoot
    if (!path.isAbsolute(filepath)) {
        return
    }
    const uri = vscode.Uri.file(filepath)
    folder = folder ? folder : vscode.workspace.getWorkspaceFolder(uri)
    if (!folder) {
        getLogger().warn(`ensureRelativePaths: no workspace for path: "${filepath}"`)
        return
    }
    const relPath = getNormalizedRelativePath(folder!.uri.fsPath, filepath)
    if (config.invokeTarget.target === TEMPLATE_TARGET_TYPE) {
        config.invokeTarget.samTemplatePath = relPath
    } else {
        config.invokeTarget.projectRoot = relPath
    }
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
        environmentVariables?: { [key: string]: string }
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
        lambda: {
            event: {},
            environmentVariables: {},
        },
    }

    if (preloadedConfig) {
        return {
            ...response,
            lambda:
                preloadedConfig.environmentVariables || preloadedConfig.eventJson
                    ? {
                          event: preloadedConfig.eventJson ? { json: preloadedConfig.eventJson } : {},
                          environmentVariables: preloadedConfig.environmentVariables,
                      }
                    : {
                          event: {},
                          environmentVariables: {},
                      },
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
    runtime: Runtime
): AwsSamDebuggerConfiguration {
    const workspaceRelativePath = folder ? getNormalizedRelativePath(folder.uri.fsPath, projectRoot) : projectRoot
    const parentDir = path.basename(path.dirname(projectRoot))

    return {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: makeName(lambdaHandler, parentDir, runtime),
        invokeTarget: {
            target: CODE_TARGET_TYPE,
            projectRoot: workspaceRelativePath,
            lambdaHandler: lambdaHandler,
        },
        lambda: {
            runtime,
            event: {},
            environmentVariables: {},
        },
    }
}
