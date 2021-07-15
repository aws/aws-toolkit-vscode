/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { activateExtension, localize } from '../utilities/vsCodeUtils'

import { CloudFormationTemplateRegistry } from './templateRegistry'
import { ext } from '../extensionGlobals'
import { getIdeProperties } from '../extensionUtilities'
import { NoopWatcher } from '../watchedFiles'
import { refreshSchemas } from './cloudformation'
import { VSCODE_EXTENSION_ID } from '../extensions'

export const TEMPLATE_FILE_GLOB_PATTERN = '**/template.{yaml,yml}'

/**
 * Match any file path that contains a .aws-sam folder. The way this works is:
 * match anything that starts  with a '/' or '\', then '.aws-sam', then either
 * a '/' or '\' followed by any number of characters or end of a string (so it
 * matches both /.aws-sam or /.aws-sam/<any number of characters>)
 */
export const TEMPLATE_FILE_EXCLUDE_PATTERN = /.*[/\\]\.aws-sam([/\\].*|$)/

/**
 * Creates a CloudFormationTemplateRegistry which retains the state of CloudFormation templates in a workspace.
 * This also assigns a FileSystemWatcher which will update the registry on any change to tracked templates.
 *
 * @param extensionContext VS Code extension context
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    refreshSchemas(extensionContext)
    // Note: redhat.vscode-yaml no longer works on vscode 1.42
    if (await activateExtension(VSCODE_EXTENSION_ID.yaml)) {
        addCustomTags()
    }

    try {
        const registry = new CloudFormationTemplateRegistry()
        await registry.addExcludedPattern(TEMPLATE_FILE_EXCLUDE_PATTERN)
        await registry.addWatchPattern(TEMPLATE_FILE_GLOB_PATTERN)
        ext.templateRegistry = registry
    } catch (e) {
        vscode.window.showErrorMessage(
            localize(
                'AWS.codelens.failToInitialize',
                'Failed to activate template registry. {0}} will not appear on SAM template files.',
                getIdeProperties().codelenses
            )
        )
        getLogger().error('Failed to activate template registry', e)
        // This prevents us from breaking for any reason later if it fails to load. Since
        // Noop watcher is always empty, we will get back empty arrays with no issues.
        ext.templateRegistry = (new NoopWatcher() as unknown) as CloudFormationTemplateRegistry
    }
    // If setting it up worked, add it to subscriptions so it is cleaned up at exit
    extensionContext.subscriptions.push(ext.templateRegistry)
}

/**
 * Adds custom tags to the YAML extension's settings in order to hide error notifications for intrinsic functions if a user has the YAML extension.
 * Lifted near-verbatim from cfn-lint's VS Code extension; writes to workspace instead of global.
 * https://github.com/aws-cloudformation/cfn-lint-visual-studio-code/blob/629de0bac4f36cfc6534e409a6f6766a2240992f/client/src/extension.ts#L56
 */
function addCustomTags(): void {
    const currentTags = vscode.workspace.getConfiguration().get<string[]>('yaml.customTags') ?? []
    const cloudFormationTags = [
        "!And",
        "!And sequence",
        "!If",
        "!If sequence",
        "!Not",
        "!Not sequence",
        "!Equals",
        "!Equals sequence",
        "!Or",
        "!Or sequence",
        "!FindInMap",
        "!FindInMap sequence",
        "!Base64",
        "!Join",
        "!Join sequence",
        "!Cidr",
        "!Ref",
        "!Sub",
        "!Sub sequence",
        "!GetAtt",
        "!GetAZs",
        "!ImportValue",
        "!ImportValue sequence",
        "!Select",
        "!Select sequence",
        "!Split",
        "!Split sequence"
    ]
    const updateTags = currentTags.concat(cloudFormationTags.filter((item) => currentTags.indexOf(item) < 0))
    vscode.workspace.getConfiguration().update('yaml.customTags', updateTags, vscode.ConfigurationTarget.Workspace)
}
