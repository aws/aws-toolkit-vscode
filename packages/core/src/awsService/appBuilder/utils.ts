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
const localize = nls.loadMessageBundle()

export async function runOpenTemplate(arg?: TreeNode) {
    const templateUri = arg ? (arg.resource as SamAppLocation).samTemplateUri : await promptUserForTemplate()
    if (!templateUri || !(await fs.exists(templateUri))) {
        throw new ToolkitError('No template provided', { code: 'NoTemplateProvided' })
    }
    const document = await vscode.workspace.openTextDocument(templateUri)
    await vscode.window.showTextDocument(document)
}

export async function runOpenHandler(arg: ResourceNode) {
    const folderUri = path.dirname(arg.resource.location.fsPath)
    let handler: string | undefined
    let extension = '*'
    if (arg.resource.resource.Runtime?.includes('java')) {
        handler = arg.resource.resource.Handler?.split('::')[0]
        if (handler?.includes('.')) {
            handler = handler.split('.')[1]
        }
        extension = 'java'
    } else if (arg.resource.resource.Runtime?.includes('dotnet')) {
        handler = arg.resource.resource.Handler?.split('::')[1]
        if (handler?.includes('.')) {
            handler = handler.split('.')[1]
        }
        extension = 'cs'
    } else {
        handler = arg.resource.resource.Handler?.split('.')[0]
    }
    const handlerFile = (
        await vscode.workspace.findFiles(
            new vscode.RelativePattern(folderUri, `**/${handler}.${extension}`),
            new vscode.RelativePattern(folderUri, '.aws-sam')
        )
    )[0]
    if (!handlerFile) {
        throw new ToolkitError(`No handler file found with name "${handler}"`, { code: 'NoHandlerFound' })
    }
    const document = await vscode.workspace.openTextDocument(handlerFile)
    await vscode.window.showTextDocument(document)
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
