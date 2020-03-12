/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { CloudFormationTemplateRegistry } from './templateRegistry'
import { CloudFormationTemplateRegistryManager } from './templateRegistryManager'

export const TEMPLATE_FILE_GLOB_PATTERN = '**/template.{yaml,yml}'

/**
 * Creates a CloudFormationTemplateRegistry which retains the state of CloudFormation templates in a workspace.
 * This also assigns a FileSystemWatcher which will update the registry on any change to tracked templates.
 *
 * @param extensionContext VS Code extension context
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    const registry = CloudFormationTemplateRegistry.getRegistry()
    const manager = new CloudFormationTemplateRegistryManager(registry)
    await manager.addTemplateGlob(TEMPLATE_FILE_GLOB_PATTERN)
    extensionContext.subscriptions.push(manager)
}
