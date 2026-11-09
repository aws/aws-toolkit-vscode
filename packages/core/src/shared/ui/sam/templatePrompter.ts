/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { getSamInitDocUrl } from '../../extensionUtilities'
import * as CloudFormation from '../../cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../fs/templateRegistry'
import { createCommonButtons } from '../buttons'
import { createQuickPick } from '../pickerPrompter'
import { openUrl } from '../../utilities/vsCodeUtils'
import * as nls from 'vscode-nls'
import { getRecentResponse } from '../../sam/utils'

export const localize = nls.loadMessageBundle()

export interface TemplateItem {
    readonly uri: vscode.Uri
    readonly data: CloudFormation.Template
}

/**
 * Creates a quick pick prompter for choosing SAM/CloudFormation templates
 *
 * @param registry - Registry containing CloudFormation templates
 * @param mementoRootKey - Root key for storing recent template selections (e.g 'samcli.deploy.params')
 * @param samCommandUrl URL to the SAM CLI command documentation
 * @param projectRoot - Optional URI of the project root to filter templates
 * @returns A QuickPick prompter configured for template selection
 *
 * The prompter displays a list of SAM/CloudFormation templates found in the workspace.
 * Templates are shown with relative paths when possible, and workspace folder names when multiple folders exist.
 * Recently used templates are marked. If no templates are found, provides a help link.
 */
export function createTemplatePrompter(
    registry: CloudFormationTemplateRegistry,
    mementoRootKey: string,
    samCommandUrl: vscode.Uri,
    projectRoot?: vscode.Uri
) {
    const folders = new Set<string>()
    const recentTemplatePath = getRecentResponse(mementoRootKey, 'global', 'templatePath')
    const filterTemplates = projectRoot
        ? registry.items.filter(({ path: filePath }) => !path.relative(projectRoot.fsPath, filePath).startsWith('..'))
        : registry.items

    const items = filterTemplates.map(({ item, path: filePath }) => {
        const uri = vscode.Uri.file(filePath)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        const label = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath) : uri.fsPath
        folders.add(workspaceFolder?.name ?? '')

        return {
            label,
            data: { uri, data: item },
            description: workspaceFolder?.name,
            recentlyUsed: recentTemplatePath === uri.fsPath,
        }
    })

    const trimmedItems = folders.size === 1 ? items.map((item) => ({ ...item, description: undefined })) : items
    return createQuickPick(trimmedItems, {
        title: 'Select a SAM/CloudFormation Template',
        placeholder: 'Select a SAM/CloudFormation Template',
        buttons: createCommonButtons(samCommandUrl),
        noItemsFoundItem: {
            label: localize('aws.sam.noWorkspace', 'No SAM template.yaml file(s) found. Select for help'),
            data: undefined,
            onClick: () => openUrl(getSamInitDocUrl()),
        },
    })
}
