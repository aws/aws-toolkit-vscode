'use strict';

import * as AWS from 'aws-sdk';
import * as vscode from 'vscode';
import { regionSettingKey, profileSettingKey } from './constants';
import { ISettingsConfiguration } from './settingsConfiguration';

// Carries the current context data on events
export class ContextChangeEventsArgs {
    constructor(public profileName: string | undefined, public regions: string[]) {
    }
}

// Wraps an AWS context in terms of credential profile and zero or more regions. The
// context listens for configuration updates and resets the context accordingly.
export class AWSContext {

    private _onDidChangeContext: vscode.EventEmitter<ContextChangeEventsArgs> = new vscode.EventEmitter<ContextChangeEventsArgs>();
    public readonly onDidChangeContext: vscode.Event<ContextChangeEventsArgs> = this._onDidChangeContext.event;

    // the collection of regions the user has expressed an interest in working with in
    // the current workspace
    private explorerRegions: string[];

    // the user's credential context (currently this maps to an sdk/cli credential profile)
    private profileName: string | undefined;

    constructor(public settingsConfiguration: ISettingsConfiguration) {

        this.profileName = settingsConfiguration.readSetting(profileSettingKey, '');
        const persistedRegions = settingsConfiguration.readSetting(regionSettingKey, undefined);
        if (persistedRegions) {
            this.explorerRegions = persistedRegions.split(',');
        } else {
            this.explorerRegions = [];
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
    public async setCredentialProfileName(profileName?: string) : Promise<void> {
        this.profileName = profileName;
        await this.settingsConfiguration.writeSetting(profileSettingKey, profileName, vscode.ConfigurationTarget.Global);
        this._onDidChangeContext.fire(new ContextChangeEventsArgs(this.profileName, this.explorerRegions));
    }

    // async so that we could *potentially* support other ways of obtaining
    // region in future - for example from instance metadata if the
    // user was running Code on an EC2 instance.
    public async getExplorerRegions(): Promise<string[]> {
        return this.explorerRegions;
    }

    // adds one or more regions into the preferred set, persisting the set afterwards as a
    // comma-separated string.
    public async addExplorerRegion(region: string | string[]) : Promise<void> {
        const regionsToProcess: string[] = region instanceof Array ? region : [region];
        regionsToProcess.forEach(r => {
            const index = this.explorerRegions.findIndex(r => r === region);
            if (index === -1) {
                this.explorerRegions.push(r);
            }
        });
        await this.settingsConfiguration.writeSetting(regionSettingKey, this.explorerRegions, vscode.ConfigurationTarget.Global);
        this._onDidChangeContext.fire(new ContextChangeEventsArgs(this.profileName, this.explorerRegions));
    }

    // removes one or more regions from the user's preferred set, persisting the set afterwards as a
    // comma-separated string.
    public async removeExplorerRegion(region: string | string[]) : Promise<void> {
        const regionsToProcess: string[] = region instanceof Array ? region : [region];
        regionsToProcess.forEach(r => {
            const index = this.explorerRegions.findIndex(r => r === region);
            if (index >= 0) {
                this.explorerRegions.splice(index, 1);
            }
        });
        await this.settingsConfiguration.writeSetting(regionSettingKey, this.explorerRegions, vscode.ConfigurationTarget.Global);
        this._onDidChangeContext.fire(new ContextChangeEventsArgs(this.profileName, this.explorerRegions));
    }
}
