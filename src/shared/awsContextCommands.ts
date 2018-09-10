'use strict';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

import { window } from 'vscode';
import { ext } from './extensionGlobals';
import { RegionHelpers } from './regions/regionHelpers';
import { credentialProfileSelector, CredentialSelectionDataProvider } from './credentials/credentialProfileSelector';
import { CredentialsFileReaderWriter } from './credentials/credentialFileReaderWriter';

export class AWSContextCommands {
    public async onCommandLogin() {
        var newProfile = await this.promptForProfileName();
        if (newProfile) {
            ext.awsContext.setCredentialProfileName(newProfile);
            this.refresh();
        }
    }

    public async onCommandLogout() {
        ext.awsContext.setCredentialProfileName();
        this.refresh();
    }

    public async onCommandShowRegion() {
        var newRegion = await this.promptForRegion();
        if (newRegion) {
            ext.awsContext.addExplorerRegion(newRegion);
            this.refresh();
        }
    }

    public async onCommandHideRegion(regionCode?: string) {
        var region = regionCode || await ext.awsContext.getExplorerRegions().then(r => this.promptForRegion(r));
        if (region) {
            ext.awsContext.removeExplorerRegion(region);
            ext.treesToRefreshOnContextChange.forEach(t => t.refresh(ext.awsContext));
        }
    }

    private refresh() {
        ext.treesToRefreshOnContextChange.forEach(t => t.refresh(ext.awsContext));
    }

    private async promptForProfileName(): Promise<string | undefined> {
        const credentialReaderWriter = new CredentialsFileReaderWriter();
        const profileNames = await credentialReaderWriter.getProfileNames();
        const dataProvider = new CredentialSelectionDataProvider(profileNames, ext.context);
        const state = await credentialProfileSelector(dataProvider);
        if (state) {
            if (state.credentialProfile) {
                return state.credentialProfile.label;
            }

            if (state.profileName) {
                window.showInformationMessage(localize('AWS.title.creatingCredentialProfile', 'Creating credential profile {0}', state.profileName));

                // TODO: using save code written for POC demos only -- need more production resiliance around this
                await credentialReaderWriter.addProfileToFile(state.profileName, state.accesskey, state.secretKey);

                return state.profileName;
            }
        }

        return undefined;
    }

    private async promptForRegion(regions?: string[]): Promise<string | undefined> {
        const availableRegions = await RegionHelpers.fetchLatestRegionData();
        const regionsToShow = availableRegions.filter(r => {
            if (regions) {
                return regions.some(x => x === r.regionCode);
            }
            return true;
        }).map(r => ({
            label: r.regionName,
            detail: r.regionCode
        }));
        const input = await window.showQuickPick(regionsToShow, {
            placeHolder: localize('AWS.message.selectRegion', 'Select an AWS region')
        });
        return input ? input.detail : undefined;
    }
}
