/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
let localize = nls.loadMessageBundle()

import { window, workspace } from 'vscode'
import { ext } from './extensionGlobals'
import { RegionProvider } from './regions/regionProvider'
import { credentialProfileSelector, DefaultCredentialSelectionDataProvider } from './credentials/defaultCredentialSelectionDataProvider'
import { DefaultCredentialsFileReaderWriter } from './credentials/defaultCredentialsFileReaderWriter'
import { AwsContext } from './awsContext'
import { AwsContextTreeCollection } from './awsContextTreeCollection'
import { RegionInfo } from './regions/regionInfo'
import { extensionSettingsPrefix } from './constants'

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
    Prompt = "prompt",
    /** 
     * Automatically add the region to the Explorer
     */
    Add = "add",
    /**
     * Do nothing
     */
    Ignore = "ignore",
}

class DefaultRegionMissingPromptItems {
    public static readonly add: string = localize("AWS.message.prompt.defaultRegionHidden.add", "Yes")
    public static readonly alwaysAdd: string = localize("AWS.message.prompt.defaultRegionHidden.alwaysAdd", "Yes, and don't ask again")
    public static readonly ignore: string = localize("AWS.message.prompt.defaultRegionHidden.ignore", "No")
    public static readonly alwaysIgnore: string = localize("AWS.message.prompt.defaultRegionHidden.alwaysIgnore", "No, and don't ask again")
}

export class DefaultAWSContextCommands {

    private _awsContext: AwsContext
    private _awsContextTrees: AwsContextTreeCollection
    private _regionProvider: RegionProvider

    constructor(awsContext: AwsContext, awsContextTrees: AwsContextTreeCollection, regionProvider: RegionProvider) {
        this._awsContext = awsContext
        this._awsContextTrees = awsContextTrees
        this._regionProvider = regionProvider
    }

    public async onCommandLogin() {
        const profileName = await this.promptForProfileName()
        if (profileName) {
            this._awsContext.setCredentialProfileName(profileName)
            this.refresh()

            await this.checkExplorerForDefaultRegion(profileName)
        }
    }

    public async onCommandLogout() {
        this._awsContext.setCredentialProfileName()
        this.refresh()
    }

    public async onCommandShowRegion() {
        const explorerRegions = new Set(await this._awsContext.getExplorerRegions())
        const newRegion = await this.promptForFilteredRegion(candidateRegion => !explorerRegions.has(candidateRegion.regionCode))

        if (newRegion) {
            this._awsContext.addExplorerRegion(newRegion)
            this.refresh()
        }
    }

    public async onCommandHideRegion(regionCode?: string) {
        var region = regionCode || await this._awsContext.getExplorerRegions().then(r => this.promptForRegion(r))
        if (region) {
            this._awsContext.removeExplorerRegion(region)
            this.refresh()
        }
    }

    private refresh() {
        this._awsContextTrees.refreshTrees(this._awsContext)
    }

    private async promptForProfileName(): Promise<string | undefined> {
        const credentialReaderWriter = new DefaultCredentialsFileReaderWriter()
        const profileNames = await credentialReaderWriter.getProfileNames()


        const dataProvider = new DefaultCredentialSelectionDataProvider(profileNames, ext.context)
        const state = await credentialProfileSelector(dataProvider)
        if (state) {
            if (state.credentialProfile) {
                return state.credentialProfile.label
            }

            if (state.profileName) {
                window.showInformationMessage(localize('AWS.title.creatingCredentialProfile', 'Creating credential profile {0}', state.profileName))

                // TODO: using save code written for POC demos only -- need more production resiliance around this
                // REMOVE_BEFORE_RELEASE
                await credentialReaderWriter.addProfileToFile(state.profileName, state.accesskey, state.secretKey)

                return state.profileName
            }
        }

        return undefined
    }

    /**
     * @description
     * Prompts the user to select a region.
     * The set shown to the user is filtered from all available regions.
     * 
     * @param filter Filter to apply to the available regions 
     */
    private async promptForFilteredRegion(filter: (region: RegionInfo) => boolean): Promise<string | undefined> {
        const availableRegions = await this._regionProvider.getRegionData()
        const regionsToShow = availableRegions.filter(r => filter(r)).map(r => r.regionCode)
        return this.promptForRegion(regionsToShow)
    }

    /**
     * Prompts the user to select a region.
     * 
     * @param regions (Optional) The regions to show the user. If none provided, all available
     * regions are shown. Regions provided must exist in the available regions to be shown.
     */
    private async promptForRegion(regions?: string[]): Promise<string | undefined> {
        const availableRegions = await this._regionProvider.getRegionData()
        const regionsToShow = availableRegions.filter(r => {
            if (regions) {
                return regions.some(x => x === r.regionCode)
            }
            return true
        }).map(r => ({
            label: r.regionName,
            detail: r.regionCode
        }))
        const input = await window.showQuickPick(regionsToShow, {
            placeHolder: localize('AWS.message.selectRegion', 'Select an AWS region')
        })
        return input ? input.detail : undefined
    }

    private async checkExplorerForDefaultRegion(profileName: string): Promise<void> {
        const credentialReaderWriter = new DefaultCredentialsFileReaderWriter()

        const profileRegion = await credentialReaderWriter.getDefaultRegion(profileName)
        if (!profileRegion) { return }

        const explorerRegions = new Set(await this._awsContext.getExplorerRegions())
        if (explorerRegions.has(profileRegion)) { return }

        // Explorer does not contain the default region. See if we should add it.
        const config = workspace.getConfiguration(extensionSettingsPrefix)

        const defaultAction = config.get<OnDefaultRegionMissingOperation>("onDefaultRegionMissing", OnDefaultRegionMissingOperation.Prompt)

        // Bypass prompt if user has requested to suppress it.
        if (defaultAction === OnDefaultRegionMissingOperation.Add) {
            await this.addRegion(profileRegion)
            return
        } else if (defaultAction === OnDefaultRegionMissingOperation.Ignore) {
            return
        }

        // Ask user what to do
        const regionHiddenResponse = await window.showQuickPick([
            DefaultRegionMissingPromptItems.add,
            DefaultRegionMissingPromptItems.alwaysAdd,
            DefaultRegionMissingPromptItems.ignore,
            DefaultRegionMissingPromptItems.alwaysIgnore
        ],
            { placeHolder: localize("AWS.message.prompt.defaultRegionHidden", "This profile's default region ({0}) is currently hidden. Would you like to show it in the Explorer?", profileRegion), }
        )

        // User Cancelled
        if (!regionHiddenResponse) { return }

        if (regionHiddenResponse === DefaultRegionMissingPromptItems.add || regionHiddenResponse === DefaultRegionMissingPromptItems.alwaysAdd) {
            await this.addRegion(profileRegion)
        }

        if (regionHiddenResponse === DefaultRegionMissingPromptItems.alwaysAdd || regionHiddenResponse === DefaultRegionMissingPromptItems.alwaysIgnore) {
            // User does not want to be prompted anymore
            const action = regionHiddenResponse === DefaultRegionMissingPromptItems.alwaysAdd ? OnDefaultRegionMissingOperation.Add : OnDefaultRegionMissingOperation.Ignore
            await config.update("onDefaultRegionMissing", action, !workspace.name)
            window.showInformationMessage(localize("AWS.message.prompt.defaultRegionHidden.suppressed", "You will no longer be asked what to do when the current profile's default region is hidden from the Explorer. This behavior can be changed by modifying the '{0}' setting.", "aws.onDefaultRegionMissing"))
        }
    }

    private async addRegion(profileRegion: string): Promise<void> {
        await this._awsContext.addExplorerRegion(profileRegion)
        this.refresh()
    }
}