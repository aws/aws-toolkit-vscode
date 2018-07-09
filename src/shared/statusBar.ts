'use strict';

import { ExtensionContext, window, StatusBarItem, StatusBarAlignment } from 'vscode';
import { ext } from './extensionGlobals';

// may want to have multiple elements of data on the status bar,
// so wrapping in a class to allow for per-element update capability
export class AWSStatusBar {

    public readonly credentialAndRegionContext: StatusBarItem;

    constructor(context: ExtensionContext) {
        this.credentialAndRegionContext = window.createStatusBarItem(StatusBarAlignment.Right, 100);
        context.subscriptions.push(this.credentialAndRegionContext);
    }

    public updateContext(): void {
        const currentContext = ext.awsContext;
        const profileName = currentContext.getCredentialProfileName();
        currentContext.getRegion().then( r => {
            if (profileName && r) {
                this.credentialAndRegionContext.text = 'AWS: ' + profileName + '@' + r;
                this.credentialAndRegionContext.show();
            } else {
                this.credentialAndRegionContext.hide();
            }
        });
    }
}