/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { createStarterTemplateFile, localize } from '../utilities/vsCodeUtils'

import { CloudFormationTemplateRegistry } from '../fs/templateRegistry'
import { getIdeProperties } from '../extensionUtilities'
import { NoopWatcher } from '../fs/watchedFiles'
import { Commands } from '../vscode/commands2'
import globals from '../extensionGlobals'
import { createCloudFormationTemplateYaml } from './cloudformation'

export const TEMPLATE_FILE_GLOB_PATTERN = '**/*.{yaml,yml}'

/**
 * Match any file path that contains a .aws-sam folder. The way this works is:
 * match anything that starts  with a '/' or '\', then '.aws-sam', then either
 * a '/' or '\' followed by any number of characters or end of a string (so it
 * matches both /.aws-sam or /.aws-sam/<any number of characters>)
 */
export const TEMPLATE_FILE_EXCLUDE_PATTERN = /.*[/\\]\.aws-sam([/\\].*|$)/

export const DEVFILE_EXCLUDE_PATTERN = /.*devfile\.(yaml|yml)/i

/**
 * Creates a CloudFormationTemplateRegistry which retains the state of CloudFormation templates in a workspace.
 * This also assigns a FileSystemWatcher which will update the registry on any change to tracked templates.
 *
 * @param extensionContext VS Code extension context
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    try {
        const registry = new CloudFormationTemplateRegistry()
        globals.templateRegistry.cfn = registry
        await registry.addExcludedPattern(DEVFILE_EXCLUDE_PATTERN)
        await registry.addExcludedPattern(TEMPLATE_FILE_EXCLUDE_PATTERN)
        await registry.addWatchPattern(TEMPLATE_FILE_GLOB_PATTERN)
        await registry.watchUntitledFiles()
    } catch (e) {
        vscode.window.showErrorMessage(
            localize(
                'AWS.codelens.failToInitialize',
                'Failed to activate cloudformation template registry. {0} will not appear on SAM template files.',
                getIdeProperties().codelenses
            )
        )
        getLogger().error('Failed to activate template registry', e)
        // This prevents us from breaking for any reason later if it fails to load. Since
        // Noop watcher is always empty, we will get back empty arrays with no issues.
        globals.templateRegistry.cfn = new NoopWatcher() as unknown as CloudFormationTemplateRegistry
    }
    // If setting it up worked, add it to subscriptions so it is cleaned up at exit
    extensionContext.subscriptions.push(
        globals.templateRegistry.cfn,
        Commands.register('aws.cloudFormation.newTemplate', () => {
            const contents = createCloudFormationTemplateYaml(false)
            return createStarterTemplateFile(contents)
        }),
        Commands.register('aws.sam.newTemplate', () => {
            const contents = createCloudFormationTemplateYaml(true)
            return createStarterTemplateFile(contents)
        })
    )
}
