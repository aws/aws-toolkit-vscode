/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as AWS from 'aws-sdk'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { AwsContext, ContextChangeEventsArgs } from './awsContext'
import { profileSettingKey, regionSettingKey } from './constants'
import { CredentialsProfileMru } from './credentials/credentialsProfileMru'
import { CredentialsManager } from './credentialsManager'
import { SettingsConfiguration } from './settingsConfiguration'

const localize = nls.loadMessageBundle()

// Wraps an AWS context in terms of credential profile and zero or more regions. The
// context listens for configuration updates and resets the context accordingly.
export class DefaultAwsContext implements AwsContext {

    public readonly onDidChangeContext: vscode.Event<ContextChangeEventsArgs>
    private readonly _credentialsMru: CredentialsProfileMru
    private readonly _onDidChangeContext: vscode.EventEmitter<ContextChangeEventsArgs>

    // the collection of regions the user has expressed an interest in working with in
    // the current workspace
    private readonly explorerRegions: string[]

    // the user's credential context (currently this maps to an sdk/cli credential profile)
    private profileName: string | undefined

    private readonly _credentialsManager: CredentialsManager

    public constructor(public settingsConfiguration: SettingsConfiguration, public context: vscode.ExtensionContext) {

        this._onDidChangeContext = new vscode.EventEmitter<ContextChangeEventsArgs>()
        this.onDidChangeContext = this._onDidChangeContext.event

        this.profileName = settingsConfiguration.readSetting(profileSettingKey, '')
        const persistedRegions = context.globalState.get<string[]>(regionSettingKey)
        this.explorerRegions = persistedRegions || []

        this._credentialsManager = new CredentialsManager()
        this._credentialsMru = new CredentialsProfileMru(context)
    }

    /**
     * @description Gets the Credentials for the current specified profile.
     * If an error is encountered, or the profile cannot be found, an Error is thrown.
     */
    public async getCredentials(): Promise<AWS.Credentials | undefined> {
        // async so that we could *potentially* support other ways of obtaining
        // credentials in future - for example from instance metadata if the
        // user was running Code on an EC2 instance.

        if (!this.profileName) { return undefined }

        try {
            const credentials = await this._credentialsManager.getCredentials(this.profileName)

            return credentials
        } catch (err) {
            const error = err as Error

            vscode.window.showErrorMessage(localize(
                'AWS.message.credentials.error',
                'There was an issue trying to use credentials profile {0}.\nYou will be disconnected from AWS.\n\n{1}',
                this.profileName,
                error.message
            ))

            throw error
        }
    }

    // returns the configured profile, if any
    public getCredentialProfileName(): string | undefined {
        return this.profileName
    }

    // resets the context to the indicated profile, saving it into settings
    public async setCredentialProfileName(profileName?: string): Promise<void> {
        this.profileName = profileName
        await this.settingsConfiguration.writeSetting(profileSettingKey, profileName, vscode.ConfigurationTarget.Global)

        if (this.profileName) {
            await this._credentialsMru.setMostRecentlyUsedProfile(this.profileName)
        }

        this._onDidChangeContext.fire(new ContextChangeEventsArgs(this.profileName, this.explorerRegions))
    }

    // async so that we could *potentially* support other ways of obtaining
    // region in future - for example from instance metadata if the
    // user was running Code on an EC2 instance.
    public async getExplorerRegions(): Promise<string[]> {
        return this.explorerRegions
    }

    // adds one or more regions into the preferred set, persisting the set afterwards as a
    // comma-separated string.
    public async addExplorerRegion(...regions: string[]): Promise<void> {
        regions.forEach(r => {
            const index = this.explorerRegions.findIndex(regionToProcess => regionToProcess === r)
            if (index === -1) {
                this.explorerRegions.push(r)
            }
        })
        await this.context.globalState.update(regionSettingKey, this.explorerRegions)
        this._onDidChangeContext.fire(new ContextChangeEventsArgs(this.profileName, this.explorerRegions))
    }

    // removes one or more regions from the user's preferred set, persisting the set afterwards as a
    // comma-separated string.
    public async removeExplorerRegion(...regions: string[]): Promise<void> {
        regions.forEach(r => {
            const index = this.explorerRegions.findIndex(explorerRegion => explorerRegion === r)
            if (index >= 0) {
                this.explorerRegions.splice(index, 1)
            }
        })

        await this.context.globalState.update(regionSettingKey, this.explorerRegions)
        this._onDidChangeContext.fire(new ContextChangeEventsArgs(this.profileName, this.explorerRegions))
    }
}
