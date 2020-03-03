/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import {
    DefaultCloudFormationTemplateRegistry,
    setTemplateRegistry
} from './templateRegistry'
import { CloudFormationTemplateRegistryManager } from './templateRegistryManager'

/**
 * Creates a CloudFormationTemplateRegistry which retains the state of CloudFormation templates in a workspace.
 * This also assigns a FileSystemWatcher which will update the registry on any change to tracked templates.
 *
 * @param extensionContext VS Code extension context
 * @param globPattern Glob pattern for files to track. Default: TEMPLATE_FILE_GLOB_PATTERN
 */
export async function activate(
    extensionContext: vscode.ExtensionContext
): Promise<void> {
    const registry = new DefaultCloudFormationTemplateRegistry()
    const manager = new CloudFormationTemplateRegistryManager(registry)
    const watcher = vscode.workspace.createFileSystemWatcher(CloudFormationTemplateRegistryManager.TEMPLATE_FILE_GLOB_PATTERN)

    manager.addWatcher(watcher)
    await manager.rebuildRegistry()

    setTemplateRegistry(registry)

    extensionContext.subscriptions.push(manager)
    extensionContext.subscriptions.push(watcher)
}
