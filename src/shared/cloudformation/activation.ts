/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createFileSystemWatcher } from '../utilities/fileSystemWatcher'
import {
    CloudFormationTemplateRegistry,
    DefaultCloudFormationTemplateRegistry,
    DefaultCloudFormationTemplateRegistryListener,
    setTemplateRegistry
} from './templateRegistry'

// this is not a relative pattern and thus will search against all workspace folders.
// also note: GlobPatterns do not respect `\`. Therefore, do not use `path.join` to create the path.
const TEMPLATE_FILE_GLOB_PATTERN = '**/template.{yaml,yml}'

/**
 * Creates a CloudFormationTemplateRegistry which retains the state of CloudFormation templates in a workspace.
 * This also assigns a FileSystemWatcher which will update the registry on any change to tracked templates.
 *
 * @param extensionContext VS Code extension context
 * @param globPattern Glob pattern for files to track. Default: TEMPLATE_FILE_GLOB_PATTERN
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    globPattern: string = TEMPLATE_FILE_GLOB_PATTERN
): Promise<void> {
    const registry = new DefaultCloudFormationTemplateRegistry()
    const listener = new DefaultCloudFormationTemplateRegistryListener(registry)
    const watcher = createFileSystemWatcher(listener, globPattern)
    await populateRegistry(registry, globPattern)
    setTemplateRegistry(registry)

    extensionContext.subscriptions.push(listener)
    extensionContext.subscriptions.push(watcher)
}

/**
 * Initial registry population is an asynchronous task and cannot be initiated in the constructor
 * Call this function immediately after constructing the registry class or else you'll have an empty registry
 * Handle as many template files as possible, as quickly as possible by queuing up all promises immediately
 *
 * @param registry CloudFormationTemplateRegistry to initially populate
 * @param globPattern Glob pattern for files to populate
 */
async function populateRegistry(registry: CloudFormationTemplateRegistry, globPattern: string) {
    const templateParsingPromises: Promise<void>[] = []

    // initial data population
    const templatePaths = await vscode.workspace.findFiles(globPattern)
    for (const templatePath of templatePaths) {
        templateParsingPromises.push(registry.addTemplateToTemplateData(templatePath))
    }

    await Promise.all(templateParsingPromises)
}
