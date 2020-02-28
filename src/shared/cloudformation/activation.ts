/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { associateFileSystemWatcherWithListener } from '../utilities/fileSystemWatcher'
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
    const watcher = vscode.workspace.createFileSystemWatcher(globPattern)
    associateFileSystemWatcherWithListener(watcher, listener, globPattern)
    const templatePaths = await vscode.workspace.findFiles(globPattern)
    await populateRegistry(registry, templatePaths)
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
 * @param templatePaths Paths to enter into the registry
 */
export async function populateRegistry(registry: CloudFormationTemplateRegistry, templatePaths: vscode.Uri[]): Promise<void> {
    const templateParsingPromises: Promise<void>[] = []
    for (const templatePath of templatePaths) {
        templateParsingPromises.push(
            new Promise(async (resolve) => {
                try {
                    await registry.addTemplateToTemplateData(templatePath)
                    resolve()
                } catch (e) {
                    resolve()
                }
            })
        )
    }

    await Promise.all(templateParsingPromises)
}
