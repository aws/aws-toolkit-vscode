'use strict';

import { ExtensionContext, window, StatusBarItem, StatusBarAlignment } from 'vscode';
import { ext } from './extensionGlobals';
import { ContextChangeEventsArgs } from './awsContext';

// may want to have multiple elements of data on the status bar,
// so wrapping in a class to allow for per-element update capability
export class AWSStatusBar {

    public readonly credentialAndRegionContext: StatusBarItem;

    constructor(context: ExtensionContext) {
        this.credentialAndRegionContext = window.createStatusBarItem(StatusBarAlignment.Right, 100);
        context.subscriptions.push(this.credentialAndRegionContext);

        ext.awsContext.onDidChangeContext((context) => {
            this.updateContext(context);
        });
    }

    public async updateContext(eventContext: ContextChangeEventsArgs | undefined) {
        let profileName: string | undefined;
        let region: string | undefined;

        if (eventContext) {
            profileName = eventContext.profileName;
            region = eventContext.region;
        }
        else {
            profileName = ext.awsContext.getCredentialProfileName();
            region = await ext.awsContext.getRegion();
        }

        if (profileName && region) {
            this.credentialAndRegionContext.text = 'AWS: ' + profileName + '/' + region;
            this.credentialAndRegionContext.show();
        } else {
            this.credentialAndRegionContext.hide();
        }
    }
}