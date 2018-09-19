'use strict'

import * as nls from 'vscode-nls'
let localize = nls.loadMessageBundle()

import { window } from 'vscode'
import { ext } from './extensionGlobals'
import { RegionProvider } from './regions/regionProvider'
import { credentialProfileSelector, DefaultCredentialSelectionDataProvider } from './credentials/defaultCredentialSelectionDataProvider'
import { DefaultCredentialsFileReaderWriter } from './credentials/defaultCredentialsFileReaderWriter'
import { AwsContext } from './awsContext'
import { AwsContextTreeCollection } from './awsContextTreeCollection'
import { RegionInfo } from './regions/regionInfo'

export class AWSContextCommands {

    private _awsContext: AwsContext
    private _awsContextTrees: AwsContextTreeCollection
    private _regionProvider: RegionProvider

    constructor(awsContext: AwsContext, awsContextTrees: AwsContextTreeCollection, regionProvider: RegionProvider) {
        this._awsContext = awsContext
        this._awsContextTrees = awsContextTrees
        this._regionProvider = regionProvider
    }

    public async onCommandLogin() {
        var newProfile = await this.promptForProfileName()
        if (newProfile) {
            this._awsContext.setCredentialProfileName(newProfile)
            this.refresh()
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
}
