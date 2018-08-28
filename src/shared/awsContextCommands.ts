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
            ext.treesToRefreshOnContextChange.forEach(t => {
                t.refresh(ext.awsContext);
            });
        }
    }

    public async onCommandLogout() {
        ext.awsContext.setCredentialProfileName();
        ext.treesToRefreshOnContextChange.forEach(t => {
            t.refresh(ext.awsContext);
        });
    }

    public async onCommandAddExplorerRegion() {
        var newRegion = await this.promptForRegion();
        if (newRegion) {
            ext.awsContext.addExplorerRegion(newRegion);
            ext.treesToRefreshOnContextChange.forEach(t => {
                t.refresh(ext.awsContext);
            });
        }
    }

    public async onCommandRemoveExplorerRegion() {
        var region = await this.promptForRegion();
        if (region) {
            ext.awsContext.removeExplorerRegion(region);
            ext.treesToRefreshOnContextChange.forEach(t => {
                t.refresh(ext.awsContext);
            });
        }
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

    private async promptForRegion(): Promise<string | undefined> {
        const availableRegions = await RegionHelpers.fetchLatestRegionData();
        const input = await window.showQuickPick(availableRegions.map(r => ({
            label: r.regionName,
            detail: r.regionCode
        })), {
            placeHolder: localize('AWS.message.selectRegion', 'Select an AWS region')
        });
        return input ? input.detail : undefined;
    }
}
