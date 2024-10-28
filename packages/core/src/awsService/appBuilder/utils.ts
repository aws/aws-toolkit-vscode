/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import * as nls from 'vscode-nls'
import { ResourceNode } from './explorer/nodes/resourceNode'
import type { SamAppLocation } from './explorer/samProject'
import { ToolkitError } from '../../shared/errors'
import globals from '../../shared/extensionGlobals'
import { OpenTemplateParams, OpenTemplateWizard } from './explorer/openTemplate'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { samDeployUrl } from '../../shared/constants'
import path from 'path'
import fs from '../../shared/fs/fs'
import { getLogger } from '../../shared/logger/logger'
import { RuntimeFamily, getFamily } from '../../lambda/models/samLambdaRuntime'
import { showMessage } from '../../shared/utilities/messages'
const localize = nls.loadMessageBundle()

export async function runOpenTemplate(arg?: TreeNode) {
    const templateUri = arg ? (arg.resource as SamAppLocation).samTemplateUri : await promptUserForTemplate()
    if (!templateUri || !(await fs.exists(templateUri))) {
        throw new ToolkitError('No template provided', { code: 'NoTemplateProvided' })
    }
    const document = await vscode.workspace.openTextDocument(templateUri)
    await vscode.window.showTextDocument(document)
}

/**
 * Find and open the lambda handler with given ResoruceNode
 * If not found, a NoHandlerFound error will be raised
 * @param arg ResourceNode
 */
export async function runOpenHandler(arg: ResourceNode): Promise<void> {
    const folderUri = path.dirname(arg.resource.location.fsPath)
    if (!arg.resource.resource.CodeUri) {
        throw new ToolkitError('No CodeUri provided in template, cannot open handler', { code: 'NoCodeUriProvided' })
    }

    if (!arg.resource.resource.Handler) {
        throw new ToolkitError('No Handler provided in template, cannot open handler', { code: 'NoHandlerProvided' })
    }

    if (!arg.resource.resource.Runtime) {
        throw new ToolkitError('No Runtime provided in template, cannot open handler', { code: 'NoRuntimeProvided' })
    }

    const handlerFile = await getLambdaHandlerFile(
        vscode.Uri.file(folderUri),
        arg.resource.resource.CodeUri,
        arg.resource.resource.Handler,
        arg.resource.resource.Runtime
    )
    if (!handlerFile) {
        throw new ToolkitError(`No handler file found with name "${arg.resource.resource.Handler}"`, {
            code: 'NoHandlerFound',
        })
    }
    await vscode.workspace.openTextDocument(handlerFile).then(async (doc) => await vscode.window.showTextDocument(doc))
}

// create a set to store all supported runtime in the following function
const supportedRuntimeForHandler = new Set<RuntimeFamily>([
    RuntimeFamily.Ruby,
    RuntimeFamily.Python,
    RuntimeFamily.NodeJS,
    RuntimeFamily.DotNet,
    RuntimeFamily.Java,
])

/**
 * Get the actual Lambda handler file, in vscode.Uri format, from the template
 * file and handler name. If not found, return undefined.
 *
 * @param folderUri The root folder for sam project
 * @param codeUri codeUri prop in sam template
 * @param handler handler prop in sam template
 * @param runtime runtime prop in sam template
 * @returns
 */
export async function getLambdaHandlerFile(
    folderUri: vscode.Uri,
    codeUri: string,
    handler: string,
    runtime: string
): Promise<vscode.Uri | undefined> {
    const family = getFamily(runtime)
    if (!supportedRuntimeForHandler.has(family)) {
        throw new ToolkitError(`Runtime ${runtime} is not supported for open handler button`, {
            code: 'RuntimeNotSupported',
        })
    }

    const handlerParts = handler.split('.')
    // sample: app.lambda_handler -> app.rb
    if (family === RuntimeFamily.Ruby) {
        // Ruby supports namespace/class handlers as well, but the path is
        // guaranteed to be slash-delimited so we can assume the first part is
        // the path
        return vscode.Uri.joinPath(folderUri, codeUri, handlerParts.slice(0, handlerParts.length - 1).join('/') + '.rb')
    }

    // sample:app.lambda_handler -> app.py
    if (family === RuntimeFamily.Python) {
        // Otherwise (currently Node.js and Python) handle dot-delimited paths
        return vscode.Uri.joinPath(folderUri, codeUri, handlerParts.slice(0, handlerParts.length - 1).join('/') + '.py')
    }

    // sample: app.handler -> app.mjs/app.js
    // More likely to be mjs if NODEJS version>=18, now searching for both
    if (family === RuntimeFamily.NodeJS) {
        const handlerName = handlerParts.slice(0, handlerParts.length - 1).join('/')
        const handlerPath = path.dirname(handlerName)
        const handlerFile = path.basename(handlerName)
        const pattern = new vscode.RelativePattern(
            vscode.Uri.joinPath(folderUri, codeUri, handlerPath),
            `${handlerFile}.{js,mjs}`
        )
        return searchHandlerFile(folderUri, pattern)
    }
    // search directly under Code uri for Dotnet and java
    // sample: ImageResize::ImageResize.Function::FunctionHandler -> Function.cs
    if (family === RuntimeFamily.DotNet) {
        const handlerName = path.basename(handler.split('::')[1].replaceAll('.', '/'))
        const pattern = new vscode.RelativePattern(vscode.Uri.joinPath(folderUri, codeUri), `${handlerName}.cs`)
        return searchHandlerFile(folderUri, pattern)
    }

    // sample: resizer.App::handleRequest -> App.java
    if (family === RuntimeFamily.Java) {
        const handlerName = handler.split('::')[0].replaceAll('.', '/')
        const pattern = new vscode.RelativePattern(vscode.Uri.joinPath(folderUri, codeUri), `**/${handlerName}.java`)
        return searchHandlerFile(folderUri, pattern)
    }
}

/**
    Searches for a handler file in the given pattern and returns the first match.
    If no match is found, returns undefined.
*/
export async function searchHandlerFile(
    folderUri: vscode.Uri,
    pattern: vscode.RelativePattern
): Promise<vscode.Uri | undefined> {
    const handlerFile = await vscode.workspace.findFiles(pattern, new vscode.RelativePattern(folderUri, '.aws-sam'))
    if (handlerFile.length === 0) {
        return undefined
    }
    if (handlerFile.length > 1) {
        getLogger().warn(`Multiple handler files found with name "${path.basename(handlerFile[0].fsPath)}"`)
        void showMessage('warn', `Multiple handler files found with name "${path.basename(handlerFile[0].fsPath)}"`)
    }
    if (await fs.exists(handlerFile[0])) {
        return handlerFile[0]
    }
    return undefined
}

async function promptUserForTemplate() {
    const registry = await globals.templateRegistry
    const openTemplateParams: Partial<OpenTemplateParams> = {}

    const param = await new OpenTemplateWizard(openTemplateParams, registry).run()
    return param?.template.uri
}

export async function deployTypePrompt() {
    const items: DataQuickPickItem<string>[] = [
        {
            label: 'Sync',
            data: 'sync',
            detail: 'Speed up your development and testing experience in the AWS Cloud. With the --watch parameter, sync will build, deploy and watch for local changes',
            description: 'Development environments',
        },
        {
            label: 'Deploy',
            data: 'deploy',
            detail: 'Deploys your template through CloudFormation',
            description: 'Production environments',
        },
    ]

    const selected = await createQuickPick(items, {
        title: localize('AWS.appBuilder.deployType.title', 'Select deployment command'),
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samDeployUrl),
    }).prompt()

    if (!selected) {
        getLogger().info('Operation cancelled.')
        return
    }
    return selected
}
