/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { localize } from '../utilities/vsCodeUtils'

import { CloudFormationTemplateRegistry } from './templateRegistry'
import { CloudFormationTemplateRegistryManager } from './templateRegistryManager'

/**
 * VSCode glob doesn't recursively expand the first **, so it also needs a second ** 
 * to find nested templates. This shouldn't be needed but is safe on any globbing implementation
 * since ** can match to empty
 */
export const TEMPLATE_FILE_GLOB_PATTERN = '{!(.aws-sam),**}/**/template.{yaml,yml}'


/**
 * Creates a CloudFormationTemplateRegistry which retains the state of CloudFormation templates in a workspace.
 * This also assigns a FileSystemWatcher which will update the registry on any change to tracked templates.
 *
 * @param extensionContext VS Code extension context
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    try {
        const registry = CloudFormationTemplateRegistry.getRegistry()
        const manager = new CloudFormationTemplateRegistryManager(registry)
        await manager.addTemplateGlob(TEMPLATE_FILE_GLOB_PATTERN)
        extensionContext.subscriptions.push(manager)
    } catch (e) {
        vscode.window.showErrorMessage(
            localize(
                'AWS.codelens.failToInitialize',
                'Failed to activate template registry. CodeLenses will not appear on SAM template files.'
            )
        )
        getLogger().error('Failed to activate template registry', e)
    }
}
