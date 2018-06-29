import * as AWS from 'aws-sdk';
import * as vscode from 'vscode';
import { REGIONS } from './constants';
import { ext } from './extensionGlobals';

export class AWSClientBuilder {
    region = "";
    constructor() {
        this.region = AWS.config.region ? AWS.config.region : "";
    }

    async build(): Promise<void> {
        if (!this.region) {
            this.region = await this.promptForRegion();
        }
        this.createGlobalClients();
    }

    private createGlobalClients(): void {
        ext.lambdaClient = new AWS.Lambda({ region: this.region });
        ext.s3Client = new AWS.S3({ region: this.region });
    }

    async configureRegion() {
        this.region = await this.promptForRegion();
        this.build();
        ext.treesToRefreshOnRegionChange.forEach(t => {
            t.refresh();
        });
    }

    private async promptForRegion(): Promise<string> {
        const input = await vscode.window.showQuickPick(REGIONS, { placeHolder: 'Select a region' });
        return input ? input : "";
    }
}