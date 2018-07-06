import * as AWS from 'aws-sdk';
import * as vscode from 'vscode';
import { regionSettingKey, profileSettingKey } from './constants';

// Wraps an AWS context in terms of credential profile and region. The
// context listens for configuration updates and resets the context
// accordingly.
export class AWSContext {
    private settingsPrefix: string;
    private region: string = '';
    private profileName: string = '';

    constructor(extensionSettingsPrefix: string) {
        this.settingsPrefix = extensionSettingsPrefix;

        const settings = vscode.workspace.getConfiguration(this.settingsPrefix);
        if (settings) {
            this.region = settings.get<string>(regionSettingKey, '');
            this.profileName = settings.get<string>(profileSettingKey, '');
        }

        if (!this.region) {
            this.region = AWS.config.region ? AWS.config.region : "";
        }
    }

    // async so that we could *potentially* support other ways of obtaining
    // credentials in future - for example from instance metadata if the
    // user was running Code on an EC2 instance.
    public async getCredentials() : Promise<AWS.Credentials | undefined> {
        if (this.profileName) {
            return new AWS.SharedIniFileCredentials({profile: this.profileName});
        }

        return undefined;
    }

    // returns the configured profile, if any
    public getCredentialProfileName() : string {
        return this.profileName;
    }

    // resets the context to the indicated profile, saving it into settings
    public async setCredentialProfileName(profileName: string) : Promise<void> {
        this.profileName = profileName;
        const settings = vscode.workspace.getConfiguration(this.settingsPrefix);
        await settings.update(profileSettingKey, profileName, vscode.ConfigurationTarget.Global);
    }

    // async so that we could *potentially* support other ways of obtaining
    // region in future - for example from instance metadata if the
    // user was running Code on an EC2 instance.
    public async getRegion(): Promise<string> {
        return this.region;
    }

    // resets the context to the indicated profile, saving it into settings
    public async setRegion(region: string) : Promise<void> {
        this.region = region;
        const settings = vscode.workspace.getConfiguration(this.settingsPrefix);
        await settings.update(regionSettingKey, region, vscode.ConfigurationTarget.Global);
    }
}
