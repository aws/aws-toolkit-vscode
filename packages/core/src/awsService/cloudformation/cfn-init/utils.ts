/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Parameter, Tag } from '@aws-sdk/client-cloudformation'
import path from 'path'
import { workspace } from 'vscode'

const cfnProjectPath = 'cfn-project'
const configFile = 'cfn-config.json'
const environmentsDirectory = 'environments'

export function convertRecordToParameters(parameters: Record<string, string>): Parameter[] {
    return Object.entries(parameters).map(([key, value]) => ({
        ParameterKey: key,
        ParameterValue: value,
    }))
}

export function convertRecordToTags(tags: Record<string, string>): Tag[] {
    return Object.entries(tags).map(([key, value]) => ({
        Key: key,
        Value: value,
    }))
}

export function convertParametersToRecord(parameters: Parameter[]): Record<string, string> {
    return Object.fromEntries(
        parameters
            .filter((param) => param.ParameterKey && param.ParameterValue)
            .map((param) => [param.ParameterKey!, param.ParameterValue!])
    )
}

export function convertTagsToRecord(tags: Tag[]): Record<string, string> {
    return Object.fromEntries(tags.filter((tag) => tag.Key && tag.Value).map((tag) => [tag.Key!, tag.Value!]))
}

export async function getEnvironmentDir(environmentName: string): Promise<string> {
    const workspaceRoot = getWorkspaceRoot()
    return path.join(workspaceRoot, cfnProjectPath, environmentsDirectory, environmentName)
}

export async function getConfigPath(): Promise<string> {
    const workspaceRoot = getWorkspaceRoot()
    return path.join(workspaceRoot, cfnProjectPath, configFile)
}

export async function getProjectDir(): Promise<string> {
    const workspaceRoot = getWorkspaceRoot()
    return path.join(workspaceRoot, cfnProjectPath)
}

export function getWorkspaceRoot(): string {
    const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceRoot) {
        throw new Error('You must open a workspace to use CFN environment commands')
    }

    return workspaceRoot
}
