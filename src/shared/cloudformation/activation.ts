/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { localize } from '../utilities/vsCodeUtils'

import { AsyncCloudFormationTemplateRegistry, CloudFormationTemplateRegistry } from '../fs/templateRegistry'
import { getIdeProperties } from '../extensionUtilities'
import { NoopWatcher } from '../fs/watchedFiles'
import { createStarterTemplateFile } from './cloudformation'
import { Commands } from '../vscode/commands2'
import globals from '../extensionGlobals'

export const templateFileGlobPattern = '**/*.{yaml,yml}'

/**
 * Match any file path that contains a .aws-sam folder. The way this works is:
 * match anything that starts  with a '/' or '\', then '.aws-sam', then either
 * a '/' or '\' followed by any number of characters or end of a string (so it
 * matches both /.aws-sam or /.aws-sam/<any number of characters>)
 */
export const templateFileExcludePattern = /.*[/\\]\.aws-sam([/\\].*|$)/

export const devfileExcludePattern = /.*devfile\.(yaml|yml)/i

/**
 * Creates a CloudFormationTemplateRegistry which retains the state of CloudFormation templates in a workspace.
 * This also assigns a FileSystemWatcher which will update the registry on any change to tracked templates.
 *
 * @param extensionContext VS Code extension context
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    try {
        const registry = new CloudFormationTemplateRegistry()
        extensionContext.subscriptions.push(registry)
        setTemplateRegistryInGlobals(registry)
    } catch (e) {
        vscode.window.showErrorMessage(
            localize(
                'AWS.codelens.failToInitialize',
                'Failed to activate template registry. {0}} will not appear on SAM template files.',
                getIdeProperties().codelenses
            )
        )
        getLogger().error('Failed to activate template registry: %s', e)
        // This prevents us from breaking for any reason later if it fails to load. Since
        // Noop watcher is always empty, we will get back empty arrays with no issues.
        globals.templateRegistry = new NoopWatcher() as unknown as CloudFormationTemplateRegistry
    }
    // If setting it up worked, add it to subscriptions so it is cleaned up at exit
    extensionContext.subscriptions.push(
        Commands.register('aws.cloudFormation.newTemplate', () => createStarterTemplateFile(false)),
        Commands.register('aws.sam.newTemplate', () => createStarterTemplateFile(true))
    )
}

/**
 * Sets the `templateRegistry` property in the `globals` variable,
 * where the value of the property depends on whether the registry
 * is fully set up.
 *
 * This function exists to resolve the registry setup taking a long time
 * and slowing down the extension starting up.
 */
function setTemplateRegistryInGlobals(registry: CloudFormationTemplateRegistry) {
    const registrySetupFunc = async (registry: CloudFormationTemplateRegistry) => {
        await registry.addExcludedPattern(devfileExcludePattern)
        await registry.addExcludedPattern(templateFileExcludePattern)
        await registry.addWatchPattern(templateFileGlobPattern)
        await registry.watchUntitledFiles()
    }

    const asyncRegistry = new AsyncCloudFormationTemplateRegistry(registry, registrySetupFunc)

    Object.defineProperty(globals, 'templateRegistry', {
        set(newInstance: CloudFormationTemplateRegistry) {
            this.cfnInstance = newInstance
        },
        get() {
            // This condition handles testing scenarios where we may have
            // already set a mock object before activation.
            // Though in prod nothing should be calling this 'set' function.
            if (this.cfnInstance) {
                return this.cfnInstance
            }

            return asyncRegistry.getInstance()
        },
    })
}
