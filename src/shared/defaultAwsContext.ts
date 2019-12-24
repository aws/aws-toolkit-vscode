/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { AwsContext, AwsContextCredentials, ContextChangeEventsArgs } from './awsContext'
import { regionSettingKey } from './constants'
import { CredentialsManager } from './credentialsManager'

const localize = nls.loadMessageBundle()

// Wraps an AWS context in terms of credential profile and zero or more regions. The
// context listens for configuration updates and resets the context accordingly.
export class DefaultAwsContext implements AwsContext {
    public readonly onDidChangeContext: vscode.Event<ContextChangeEventsArgs>
    private readonly _onDidChangeContext: vscode.EventEmitter<ContextChangeEventsArgs>

    // the collection of regions the user has expressed an interest in working with in
    // the current workspace
    private readonly explorerRegions: string[]

    private currentCredentials: AwsContextCredentials | undefined

    public constructor(
        public context: vscode.ExtensionContext,
        private readonly credentialsManager: CredentialsManager = new CredentialsManager()
    ) {
        this._onDidChangeContext = new vscode.EventEmitter<ContextChangeEventsArgs>()
        this.onDidChangeContext = this._onDidChangeContext.event

        const persistedRegions = context.globalState.get<string[]>(regionSettingKey)
        this.explorerRegions = persistedRegions || []
    }

    public async setCredentials(credentials?: AwsContextCredentials): Promise<void> {
        this.currentCredentials = credentials
        this.emitEvent()
    }

    /**
     * @description Gets the Credentials for the current specified profile.
     * If a profile name is provided, overrides existing profile.
     * If no profile is attached to the context and no profile was specified, returns undefined.
     * If an error is encountered, or the profile cannot be found, an Error is thrown.
     *
     * @param profileName (optional): override profile name to pull credentials for (useful for validation)
     */
    public async getCredentials(profileName?: string): Promise<AWS.Credentials | undefined> {
        if (!profileName) {
            return this.currentCredentials?.credentials
        }

        // TODO : Remove Credentials Loading from DefaultAwsContext -- this should only return the "current" Credentials
        const profile = profileName || this.currentCredentials?.credentialsId

        if (!profile) {
            return undefined
        }

        try {
            return await this.credentialsManager.getCredentials(profile)
        } catch (err) {
            const error = err as Error

            vscode.window.showErrorMessage(
                localize(
                    'AWS.message.credentials.error',
                    'There was an issue trying to use credentials profile {0}: {1}',
                    profile,
                    error.message
                )
            )

            throw error
        }
    }

    // returns the configured profile, if any
    public getCredentialProfileName(): string | undefined {
        return this.currentCredentials?.credentialsId
    }

    // returns the configured profile's account ID, if any
    public getCredentialAccountId(): string | undefined {
        return this.currentCredentials?.accountId
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
    }

    private emitEvent() {
        this._onDidChangeContext.fire({
            profileName: this.currentCredentials?.credentialsId,
            accountId: this.currentCredentials?.accountId
        })
    }
}
