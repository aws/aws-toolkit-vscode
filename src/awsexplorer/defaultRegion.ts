/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { extensionSettingsPrefix } from '../shared/constants'
import { DefaultCredentialsFileReaderWriter } from '../shared/credentials/defaultCredentialsFileReaderWriter'
import { AwsExplorer } from './awsExplorer'

/**
 * The actions that can be taken when we discover that a profile's default region is not
 * showing in the Explorer.
 *
 * Keep this in sync with the onDefaultRegionMissing configuration defined in package.json.
 */
enum OnDefaultRegionMissingOperation {
    /**
     * Ask the user what they would like to happen
     */
    Prompt = 'prompt',
    /**
     * Automatically add the region to the Explorer
     */
    Add = 'add',
    /**
     * Do nothing
     */
    Ignore = 'ignore'
}

class DefaultRegionMissingPromptItems {
    public static readonly add: string = localize('AWS.message.prompt.defaultRegionHidden.add', 'Yes')
    public static readonly alwaysAdd: string = localize(
        'AWS.message.prompt.defaultRegionHidden.alwaysAdd',
        "Yes, and don't ask again"
    )
    public static readonly ignore: string = localize('AWS.message.prompt.defaultRegionHidden.ignore', 'No')
    public static readonly alwaysIgnore: string = localize(
        'AWS.message.prompt.defaultRegionHidden.alwaysIgnore',
        "No, and don't ask again"
    )
}

export async function checkExplorerForDefaultRegion(
    profileName: string,
    awsContext: AwsContext,
    awsExplorer: AwsExplorer
): Promise<void> {
    const credentialReaderWriter = new DefaultCredentialsFileReaderWriter()

    const profileRegion = await credentialReaderWriter.getDefaultRegion(profileName)
    if (!profileRegion) {
        return
    }

    const explorerRegions = new Set(await awsContext.getExplorerRegions())
    if (explorerRegions.has(profileRegion)) {
        return
    }

    // Explorer does not contain the default region. See if we should add it.
    const config = vscode.workspace.getConfiguration(extensionSettingsPrefix)

    const defaultAction = config.get<OnDefaultRegionMissingOperation>(
        'onDefaultRegionMissing',
        OnDefaultRegionMissingOperation.Prompt
    )

    // Bypass prompt if user has requested to suppress it.
    if (defaultAction === OnDefaultRegionMissingOperation.Add) {
        await awsContext.addExplorerRegion(profileRegion)
        awsExplorer.refresh()

        return
    } else if (defaultAction === OnDefaultRegionMissingOperation.Ignore) {
        return
    }

    // Ask user what to do
    const regionHiddenResponse = await vscode.window.showQuickPick(
        [
            DefaultRegionMissingPromptItems.add,
            DefaultRegionMissingPromptItems.alwaysAdd,
            DefaultRegionMissingPromptItems.ignore,
            DefaultRegionMissingPromptItems.alwaysIgnore
        ],
        {
            placeHolder: localize(
                'AWS.message.prompt.defaultRegionHidden',
                // prettier-ignore
                "This profile's default region ({0}) is currently hidden. Would you like to show it in the Explorer?",
                profileRegion
            )
        }
    )

    // User Cancelled
    if (!regionHiddenResponse) {
        return
    }

    switch (regionHiddenResponse) {
        case DefaultRegionMissingPromptItems.add:
        case DefaultRegionMissingPromptItems.alwaysAdd:
            await awsContext.addExplorerRegion(profileRegion)
            awsExplorer.refresh()
            break
    }

    switch (regionHiddenResponse) {
        case DefaultRegionMissingPromptItems.alwaysAdd:
        case DefaultRegionMissingPromptItems.alwaysIgnore:
            // User does not want to be prompted anymore
            const action =
                regionHiddenResponse === DefaultRegionMissingPromptItems.alwaysAdd
                    ? OnDefaultRegionMissingOperation.Add
                    : OnDefaultRegionMissingOperation.Ignore
            await config.update('onDefaultRegionMissing', action, vscode.ConfigurationTarget.Global)
            vscode.window.showInformationMessage(
                localize(
                    'AWS.message.prompt.defaultRegionHidden.suppressed',
                    // prettier-ignore
                    "You will no longer be asked what to do when the current profile's default region is hidden from the Explorer. This behavior can be changed by modifying the '{0}' setting.",
                    'aws.onDefaultRegionMissing'
                )
            )
            break
    }
}
