'use strict';

import { ExtensionContext, window, StatusBarItem, StatusBarAlignment } from 'vscode';
import { ext } from './extensionGlobals';
import { AWSContext } from './awsContext';

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

    public async updateContext(newContext: AWSContext | undefined) {
        const context = newContext ? newContext : ext.awsContext;
        const currentProfile = context.getCredentialProfileName();
        const currentRegion = await context.getRegion();
        if (currentProfile && currentRegion) {
                this.credentialAndRegionContext.text = 'AWS: ' + currentProfile + '@' + currentRegion;
                this.credentialAndRegionContext.show();
        } else {
            this.credentialAndRegionContext.hide();
        }
    }
}