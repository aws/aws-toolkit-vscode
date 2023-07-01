/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { Runtime } from 'aws-sdk/clients/lambda'
import { getNormalizedRelativePath } from '../../utilities/pathUtils'
import {
    APIGatewayProperties,
    AwsSamDebuggerConfiguration,
    CodeTargetProperties,
    TemplateTargetProperties,
} from './awsSamDebugConfiguration.gen'
import { getLogger } from '../../logger'
import { isCloud9 } from '../../extensionUtilities'

export * from './awsSamDebugConfiguration.gen'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam' // eslint-disable-line @typescript-eslint/naming-convention
export const DIRECT_INVOKE_TYPE = 'direct-invoke' // eslint-disable-line @typescript-eslint/naming-convention
export const TEMPLATE_TARGET_TYPE = 'template' as const // eslint-disable-line @typescript-eslint/naming-convention
export const CODE_TARGET_TYPE = 'code' as const // eslint-disable-line @typescript-eslint/naming-convention
export const API_TARGET_TYPE = 'api' as const // eslint-disable-line @typescript-eslint/naming-convention
export const awsSamDebugRequestTypes = [DIRECT_INVOKE_TYPE]
export const awsSamDebugTargetTypes = [TEMPLATE_TARGET_TYPE, CODE_TARGET_TYPE, API_TARGET_TYPE]

export type AwsSamTargetType = 'api' | 'code' | 'template'

export type TargetProperties = AwsSamDebuggerConfiguration['invokeTarget']

export interface ReadonlyJsonObject {
    readonly [key: string]: string | number | boolean
}

export function isAwsSamDebugConfiguration(config: vscode.DebugConfiguration): config is AwsSamDebuggerConfiguration {
    return config.type === AWS_SAM_DEBUG_TYPE
}

export function isTemplateTargetProperties(props: TargetProperties): props is TemplateTargetProperties {
    return props.target === TEMPLATE_TARGET_TYPE || props.target === API_TARGET_TYPE
}

export function isCodeTargetProperties(props: TargetProperties): props is CodeTargetProperties {
    return props.target === CODE_TARGET_TYPE
}

/**
 * Ensures that the `projectRoot` or `templatePath` relative properties on
 * the given `config` are relative (not absolute) paths.
 *
 * @param folder  Workspace folder, or empty to use the workspace associated with `projectRoot` or `templatePath`.
 * @param config
 */
export function ensureRelativePaths(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration
): void {
    if (!config?.invokeTarget?.target) {
        // User has an invalid type=aws-sam launch-config.
        return
    }
    const filepath =
        config.invokeTarget.target === CODE_TARGET_TYPE
            ? config.invokeTarget.projectRoot
            : config.invokeTarget.templatePath
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
    if (config.invokeTarget.target === CODE_TARGET_TYPE) {
        config.invokeTarget.projectRoot = relPath
    } else {
        config.invokeTarget.templatePath = relPath
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
 * Creates a description for a SAM debugconfig entry (in launch.json), preprending API
 *
 * see: makeName for the format
 */
function makeNameApi(primaryName: string, parentDir: string | undefined, suffix: string | undefined) {
    return `API ${makeName(primaryName, parentDir, suffix)}`
}

/**
 *
 * @param folder
 * @param runtimeName  Optional runtime name used to enhance the config name
 * @addRuntimeToConfig
 * @param resourceName
 * @param templatePath
 * @param preloadedConfig
 */
export function createTemplateAwsSamDebugConfig(
    folder: vscode.WorkspaceFolder | undefined,
    runtimeName: string | undefined,
    addRuntimeToConfig: boolean,
    resourceName: string,
    templatePath: string,
    preloadedConfig?: {
        eventJson?: ReadonlyJsonObject
        environmentVariables?: { [key: string]: string }
        dockerNetwork?: string
        useContainer?: boolean
    }
): AwsSamDebuggerConfiguration {
    const workspaceRelativePath = makeWorkspaceRelativePath(folder, templatePath)
    const templateParentDir = path.basename(path.dirname(templatePath))

    const response: AwsSamDebuggerConfiguration = {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: makeName(resourceName, templateParentDir, runtimeName),
        invokeTarget: {
            target: TEMPLATE_TARGET_TYPE,
            templatePath: workspaceRelativePath,
            logicalId: resourceName,
        },
        lambda: {
            payload: {},
            environmentVariables: {},
        },
    }

    if (addRuntimeToConfig) {
        response.lambda!.runtime = runtimeName
    }

    if (preloadedConfig) {
        return {
            ...response,
            lambda:
                preloadedConfig.environmentVariables || preloadedConfig.eventJson
                    ? {
                          payload: preloadedConfig.eventJson ? { json: preloadedConfig.eventJson } : {},
                          environmentVariables: preloadedConfig.environmentVariables,
                      }
                    : {
                          payload: {},
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
    const workspaceRelativePath = makeWorkspaceRelativePath(folder, projectRoot)
    const parentDir = path.basename(projectRoot)

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
            payload: {},
            environmentVariables: {},
        },
    }
}

export function createApiAwsSamDebugConfig(
    folder: vscode.WorkspaceFolder | undefined,
    runtimeName: string | undefined,
    resourceName: string,
    templatePath: string,
    preloadedConfig?: {
        path?: string
        httpMethod?: string
        payload?: APIGatewayProperties['payload']
    }
): AwsSamDebuggerConfiguration {
    const workspaceRelativePath = makeWorkspaceRelativePath(folder, templatePath)
    const templateParentDir = path.basename(path.dirname(templatePath))

    const withRuntime = runtimeName
        ? {
              lambda: {
                  runtime: runtimeName,
              },
          }
        : undefined

    return {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: makeNameApi(resourceName, templateParentDir, runtimeName),
        invokeTarget: {
            target: API_TARGET_TYPE,
            templatePath: workspaceRelativePath,
            logicalId: resourceName,
        },
        api: {
            path: preloadedConfig?.path ?? '/',
            // coerce it into the correct type. The types do not entirely overlap (there is an any)
            // so in that case let the user decide
            httpMethod: (preloadedConfig?.httpMethod as APIGatewayProperties['httpMethod']) ?? 'get',
            payload: preloadedConfig?.payload ?? { json: {} },
        },
        ...withRuntime,
    }
}

function makeWorkspaceRelativePath(folder: vscode.WorkspaceFolder | undefined, target: string): string {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length <= 1) {
        return folder
            ? isCloud9() // TODO: remove when Cloud9 supports ${workspaceFolder}.
                ? getNormalizedRelativePath(folder.uri.fsPath, target)
                : `\${workspaceFolder}/${getNormalizedRelativePath(folder.uri.fsPath, target)}`
            : target
    }

    return target
}
