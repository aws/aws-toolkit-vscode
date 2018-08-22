'use strict';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

import * as vscode from 'vscode';
import { ext } from './extensionGlobals';
import { RegionHelpers } from './regionHelpers';
//import { REGIONS } from './constants';

class QuickPickRegion implements vscode.QuickPickItem {
    label: string; description?: string | undefined;
    detail?: string | undefined;
    picked?: boolean | undefined;
    constructor(public regionCode: string, public regionName: string, isSelected?: boolean) {
        this.label = `${regionName}`;
        this.picked = isSelected;
    }
}

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

    private async promptForProfileName(): Promise<string> {
        const input = await vscode.window.showInputBox({ placeHolder: localize('AWS.message.enterProfileName', 'Enter the name of the credential profile to use') });
        return input ? input : "";
    }

    private async promptForRegion(): Promise<string | undefined> {
        const availableRegions = await RegionHelpers.fetchLatestRegionData();
        let qpRegions: QuickPickRegion[] = [];
        availableRegions.forEach(r => {
            qpRegions.push(new QuickPickRegion(r.regionCode, r.regionName));
        });
        const input = await vscode.window.showQuickPick(qpRegions, { placeHolder: localize('AWS.message.selectRegion', 'Select an AWS region') });
        return input ? input.regionCode : undefined;
    }
}
