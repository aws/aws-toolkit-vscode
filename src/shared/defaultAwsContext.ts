/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import * as vscode from 'vscode'
import { AwsContext, AwsContextCredentials, ContextChangeEventsArgs } from './awsContext'
import { regionSettingKey } from './constants'
import { getLogger } from '../shared/logger'

const logged = new Set<string>()
const DEFAULT_REGION = 'us-east-1'

/**
 * Wraps an AWS context in terms of credential profile and zero or more regions. The
 * context listens for configuration updates and resets the context accordingly.
 */
export class DefaultAwsContext implements AwsContext {
    public readonly onDidChangeContext: vscode.Event<ContextChangeEventsArgs>
    private readonly _onDidChangeContext: vscode.EventEmitter<ContextChangeEventsArgs>

    // the collection of regions the user has expressed an interest in working with in
    // the current workspace
    private readonly explorerRegions: string[]

    private currentCredentials: AwsContextCredentials | undefined

    public constructor(public context: vscode.ExtensionContext) {
        this._onDidChangeContext = new vscode.EventEmitter<ContextChangeEventsArgs>()
        this.onDidChangeContext = this._onDidChangeContext.event

        const persistedRegions = context.globalState.get<string[]>(regionSettingKey)
        this.explorerRegions = persistedRegions || []
    }

    /**
     * Sets the credentials to be used by the Toolkit.
     * Passing in undefined represents that there are no active credentials.
     */
    public async setCredentials(credentials?: AwsContextCredentials): Promise<void> {
        this.currentCredentials = credentials
        this.emitEvent()
    }

    /**
     * @description Gets the Credentials currently used by the Toolkit.
     */
    public async getCredentials(): Promise<AWS.Credentials | undefined> {
        return this.currentCredentials?.credentials
    }

    // returns the configured profile, if any
    public getCredentialProfileName(): string | undefined {
        return this.currentCredentials?.credentialsId
    }

    // returns the configured profile's account ID, if any
    public getCredentialAccountId(): string | undefined {
        return this.currentCredentials?.accountId
    }

    public getCredentialDefaultRegion(): string {
        const credId = this.currentCredentials?.credentialsId ?? ''
        if (!logged.has(credId) && !this.currentCredentials?.defaultRegion) {
            logged.add(credId)
            getLogger().warn(
                `AwsContext: no default region in credentials profile, falling back to ${DEFAULT_REGION}: ${credId}`
            )
        }

        return this.currentCredentials?.defaultRegion ?? DEFAULT_REGION
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
            accountId: this.currentCredentials?.accountId,
        })
    }
}
