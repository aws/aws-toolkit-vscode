/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from '@aws-sdk/types'
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

    private credentials: AwsContextCredentials | undefined
    private cawsUsername: string | undefined
    private cawsSecret: string | undefined

    public constructor(public context: vscode.ExtensionContext) {
        this._onDidChangeContext = new vscode.EventEmitter<ContextChangeEventsArgs>()
        this.onDidChangeContext = this._onDidChangeContext.event

        const persistedRegions = context.globalState.get<string[]>(regionSettingKey)
        this.explorerRegions = persistedRegions || []
    }

    public async setCredentials(credentials?: AwsContextCredentials): Promise<void> {
        this.credentials = credentials
        this.emitEvent()
    }

    public async getCredentials(): Promise<AWS.Credentials | undefined> {
        return this.credentials?.credentials
    }

    public setCawsCredentials(username: string, secret: string): void {
        this.cawsUsername = username
        this.cawsSecret = secret
        this.emitEvent()
    }

    public getCawsCredentials(): string | undefined {
        return this.cawsUsername
    }

    // returns the configured profile, if any
    public getCredentialProfileName(): string | undefined {
        return this.credentials?.credentialsId
    }

    // returns the configured profile's account ID, if any
    public getCredentialAccountId(): string | undefined {
        return this.credentials?.accountId
    }

    public getCredentialDefaultRegion(): string {
        const credId = this.credentials?.credentialsId ?? ''
        if (!logged.has(credId) && !this.credentials?.defaultRegion) {
            logged.add(credId)
            getLogger().warn(
                `AwsContext: no default region in credentials profile, falling back to ${DEFAULT_REGION}: ${credId}`
            )
        }

        return this.credentials?.defaultRegion ?? DEFAULT_REGION
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
            profileName: this.credentials?.credentialsId,
            accountId: this.credentials?.accountId,
            cawsUsername: this.cawsUsername,
            cawsSecret: this.cawsSecret,
        })
    }
}
