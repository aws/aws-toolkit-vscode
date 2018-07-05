import * as vscode from 'vscode';
import { REGIONS } from './constants';
import { ext } from './extensionGlobals';
import { AWSContext } from './awsContext';

export class AWSClientBuilder {

    private awsContext: AWSContext;

    constructor(awsContext: AWSContext) {
        this.awsContext = awsContext;

    }

    // centralized construction of transient AWS service clients, allowing us
    // to customize requests and/or user agent
    public async createAndConfigureSdkClient(awsService: any, awsServiceOpts: any) : Promise<any> {
        if (awsServiceOpts) {
            if (!awsServiceOpts.credentials) {
                awsServiceOpts.credentials = await this.awsContext.getCredentials();
            }
            if (!awsServiceOpts.region) {
                awsServiceOpts.region = await this.awsContext.getRegion();
            }

            return new awsService(awsServiceOpts);
        }

        return new awsService({
            credentials: await this.awsContext.getCredentials(),
            region: await this.awsContext.getRegion()
        });
    }

    async onCommandConfigureRegion() {
        var newRegion = await this.promptForRegion();
        if (newRegion) {
            this.awsContext.setRegion(await this.promptForRegion());
            //this.createGlobalClients();
           ext.treesToRefreshOnContextChange.forEach(t => {
               t.refresh(this.awsContext);
           });
        }
    }

    private async promptForRegion(): Promise<string> {
        const input = await vscode.window.showQuickPick(REGIONS, { placeHolder: 'Select an AWS region' });
        return input ? input : "";
    }
}