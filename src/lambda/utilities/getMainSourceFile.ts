/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { CloudFormation } from '../../shared/cloudformation/cloudformation'
import * as fs from '../../shared/filesystemUtilities'
import { filterAsync, first } from '../../shared/utilities/collectionUtils'
import { detectLocalTemplates } from '../local/detectLocalTemplates'
import { getFamily, SamLambdaRuntimeFamily } from '../models/samLambdaRuntime'

export interface OpenMainSourceFileUriContext {
    getLocalTemplates(...workspaceUris: vscode.Uri[]): AsyncIterable<vscode.Uri>
    loadSamTemplate(uri: vscode.Uri): Promise<CloudFormation.Template>
    fileExists(path: string): Promise<boolean>
}

export async function getMainSourceFileUri(
    {
        root,
        getLocalTemplates = (...workspaceUris: vscode.Uri[]) => detectLocalTemplates({ workspaceUris }),
        loadSamTemplate = async uri => await CloudFormation.load(uri.fsPath),
        fileExists = fs.fileExists
    }: Partial<OpenMainSourceFileUriContext> & {
        root: vscode.Uri
    }
): Promise<vscode.Uri> {
    const templateUri = await first(getLocalTemplates(root))
    if (!templateUri) {
        throw new Error(`Invalid project format: '${root.fsPath}' does not contain a SAM template.`)
    }

    const lambdaResource: CloudFormation.Resource = await getFirstLambdaResource({
        templateUri,
        loadSamTemplate,
        fileExists
    })

    return await getSourceFileUri({
        root: vscode.Uri.file(path.dirname(templateUri.fsPath)),
        resource: lambdaResource,
        fileExists
    })
}

async function getFirstLambdaResource(
    {
        templateUri,
        loadSamTemplate
    }: Pick<OpenMainSourceFileUriContext, 'loadSamTemplate' | 'fileExists'> & {
        templateUri: vscode.Uri
    }
): Promise<CloudFormation.Resource> {
    const template = await loadSamTemplate(templateUri)
    if (!template.Resources) {
        throw new Error(`SAM Template '${templateUri.fsPath}' does not contain any resources`)
    }

    const lambdaResources = Object.getOwnPropertyNames(template.Resources)
        .map(property => template.Resources![property]!)
        .filter(resource => resource.Type === 'AWS::Serverless::Function')

    if (lambdaResources.length <= 0) {
        throw new Error(`SAM Template '${templateUri.fsPath}' does not contain any lambda resources`)
    }

    return lambdaResources[0]
}

async function getSourceFileUri({
    root,
    resource,
    fileExists
}: Pick<OpenMainSourceFileUriContext, 'fileExists'> & {
    root: vscode.Uri,
    resource: CloudFormation.Resource
}) {
    if (!resource.Properties) {
        throw new Error(
            `Lambda resource is missing the 'Properties' property:${os.EOL}` +
            JSON.stringify(resource, undefined, 4)
        )
    }

    const { Handler, Runtime } = resource.Properties
    switch (getFamily(Runtime)) {
        case SamLambdaRuntimeFamily.NodeJS:
            return await getNodeSourceFileUri({ root, resource, fileExists })
        case SamLambdaRuntimeFamily.Python:
            return await getPythonSourceFileUri({ root, resource, fileExists })
        default:
            throw new Error(`Lambda resource '${Handler}' has unknown runtime '${Runtime}'`)

    }
}

async function getNodeSourceFileUri({
    fileExists,
    root,
    resource,
}: Pick<OpenMainSourceFileUriContext, 'fileExists'> & {
    root: vscode.Uri,
    resource: CloudFormation.Resource
}): Promise<vscode.Uri> {
    const handler = resource.Properties!.Handler
    const tokens = handler.split('.', 1) || [handler]
    const basePath = path.join(root.fsPath, resource.Properties!.CodeUri, tokens[0])

    const file = await first(filterAsync(
        ['.ts', '.jsx', '.js'].map(extension => `${basePath}${extension}`),
        async (p: string) => await fileExists(p)
    ))

    if (file) {
        return vscode.Uri.file(file)
    }

    throw new Error(`Javascript file expected at ${basePath}.(ts|jsx|js), but no file was found`)
}

async function getPythonSourceFileUri({
    fileExists,
    root,
    resource,
}: Pick<OpenMainSourceFileUriContext, 'fileExists'> & {
    root: vscode.Uri,
    resource: CloudFormation.Resource
}): Promise<vscode.Uri> {
    const handler = resource.Properties!.Handler
    const tokens = handler.split('.', 1) || [handler]
    const basePath = path.join(root.fsPath, resource.Properties!.CodeUri, tokens[0])

    const file = await first(filterAsync(
        [`${basePath}.py`],
        async (p: string) => await fileExists(p)
    ))

    if (file) {
        return vscode.Uri.file(file)
    }

    throw new Error(`Python file expected at ${basePath}.py, but no file was found`)
}
