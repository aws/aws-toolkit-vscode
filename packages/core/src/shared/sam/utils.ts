/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { TreeNode, isTreeNode } from '../treeview/resourceTreeDataProvider'
import * as CloudFormation from '../cloudformation/cloudformation'
import { TemplateItem } from '../ui/common/samTemplate'
import { RuntimeFamily, getFamily } from '../../lambda/models/samLambdaRuntime'
import { SamCliSettings } from './cli/samCliSettings'
import { ToolkitError } from '../errors'
import { SamCliInfoInvocation } from './cli/samCliInfo'
import { parse } from 'semver'
import { telemetry } from '../telemetry/telemetry'
import globals from '../extensionGlobals'
import { getLogger } from '../logger/logger'

/**
 * @description determines the root directory of the project given Template Item
 * @param templateItem Template item object.
 * @returns The URI of the root project folder (may differ from workspace)
 * */
export const getProjectRoot = (template: TemplateItem | undefined) =>
    template ? getProjectRootUri(template.uri) : undefined

/**
 * @description determines the root directory of the project given uri of the template file
 * @param template The template.yaml uri
 * @returns The URI of the root project folder (may differ from workspace)
 * */
export const getProjectRootUri = (templateUri: vscode.Uri) => vscode.Uri.file(path.dirname(templateUri.path))

export function getSource(arg: vscode.Uri | AWSTreeNodeBase | TreeNode | undefined): string | undefined {
    if (arg instanceof vscode.Uri) {
        return 'template'
    } else if (arg instanceof AWSTreeNodeBase) {
        return 'regionNode'
    } else if (isTreeNode(arg)) {
        return 'appBuilderDeploy'
    } else {
        return undefined
    }
}
/**
 * Returns if a corresponding SAM template (received as a URI or string content) has
 * any function using .NET runtime
 * @param path A uri with the absolute path to the template file
 * @param contents The contents of the template file, directly as a string
 */
export async function isDotnetRuntime(templateUri: vscode.Uri, contents?: string): Promise<boolean> {
    const samTemplate = await CloudFormation.tryLoad(templateUri, contents)

    if (!samTemplate.template?.Resources) {
        return false
    }
    for (const resource of Object.values(samTemplate.template.Resources)) {
        if (resource?.Type === 'AWS::Serverless::Function') {
            if (resource.Properties?.Runtime) {
                if (getFamily(resource.Properties?.Runtime) === RuntimeFamily.DotNet) {
                    return true
                }
            }
        }
    }
    const globalRuntime = samTemplate.template.Globals?.Function?.Runtime as string
    return globalRuntime ? getFamily(globalRuntime) === RuntimeFamily.DotNet : false
}

export async function getSamCliPathAndVersion() {
    const { path: samCliPath } = await SamCliSettings.instance.getOrDetectSamCli()
    if (samCliPath === undefined) {
        throw new ToolkitError('SAM CLI could not be found', { code: 'MissingExecutable' })
    }

    const info = await new SamCliInfoInvocation(samCliPath).execute()
    const parsedVersion = parse(info.version)
    telemetry.record({ version: info.version })

    if (parsedVersion?.compare('1.53.0') === -1) {
        throw new ToolkitError('SAM CLI version 1.53.0 or higher is required', { code: 'VersionTooLow' })
    }

    return { path: samCliPath, parsedVersion }
}

export function getRecentResponse(mementoRootKey: string, identifier: string, key: string): string | undefined {
    const root = globals.context.workspaceState.get(mementoRootKey, {} as Record<string, Record<string, string>>)
    return root[identifier]?.[key]
}

export async function updateRecentResponse(
    mementoRootKey: string,
    identifier: string,
    key: string,
    value: string | undefined
) {
    try {
        const root = globals.context.workspaceState.get(mementoRootKey, {} as Record<string, Record<string, string>>)
        await globals.context.workspaceState.update(mementoRootKey, {
            ...root,
            [identifier]: { ...root[identifier], [key]: value },
        })
    } catch (err) {
        getLogger().warn(`sam: unable to save response at key "${key}": %s`, err)
    }
}
