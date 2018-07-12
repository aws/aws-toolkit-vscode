'use strict';

import * as AWS from 'aws-sdk';
import * as vscode from 'vscode';
import { regionSettingKey, profileSettingKey } from './constants';
import { ISettingsConfiguration } from './settingsConfiguration';

// Carries the current context data on events
export class ContextChangeEventsArgs {
    constructor(public profileName: string | undefined, public region: string | undefined) {
    }
}

// Wraps an AWS context in terms of credential profile and region. The
// context listens for configuration updates and resets the context
// accordingly.
export class AWSContext {

    private _onDidChangeContext: vscode.EventEmitter<ContextChangeEventsArgs> = new vscode.EventEmitter<ContextChangeEventsArgs>();
    public readonly onDidChangeContext: vscode.Event<ContextChangeEventsArgs> = this._onDidChangeContext.event;

    private region: string | undefined;
    private profileName: string | undefined;

    constructor(public settingsConfiguration: ISettingsConfiguration) {

        this.region = settingsConfiguration.readSetting(regionSettingKey, '');
        this.profileName = settingsConfiguration.readSetting(profileSettingKey, '');

        if (!this.region) {
            this.region = AWS.config.region ? AWS.config.region : '';
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
    public getCredentialProfileName() : string | undefined {
        return this.profileName;
    }

    // resets the context to the indicated profile, saving it into settings
    public async setCredentialProfileName(profileName: string) : Promise<void> {
        this.profileName = profileName;
        await this.settingsConfiguration.writeSetting(profileSettingKey, profileName, vscode.ConfigurationTarget.Global);

        this._onDidChangeContext.fire(new ContextChangeEventsArgs(this.profileName, this.region));
    }

    // async so that we could *potentially* support other ways of obtaining
    // region in future - for example from instance metadata if the
    // user was running Code on an EC2 instance.
    public async getRegion(): Promise<string | undefined> {
        return this.region;
    }

    // resets the context to the indicated profile, saving it into settings
    public async setRegion(region: string) : Promise<void> {
        this.region = region;
        await this.settingsConfiguration.writeSetting(regionSettingKey, region, vscode.ConfigurationTarget.Global);

        this._onDidChangeContext.fire(new ContextChangeEventsArgs(this.profileName, this.region));
    }
}
