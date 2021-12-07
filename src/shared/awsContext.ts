/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AWS from '@aws-sdk/types'
import { regionSettingKey } from './constants'
import { getLogger } from '../shared/logger'
import { ClassToInterfaceType } from './utilities/tsUtils'

export interface AwsContextCredentials {
    readonly credentials: AWS.Credentials
    readonly credentialsId: string
    readonly accountId?: string
    readonly defaultRegion?: string
}

/** AWS Toolkit context change */
export interface ContextChangeEventsArgs {
    /** AWS credentials profile name. */
    readonly profileName?: string
    /** AWS account. */
    readonly accountId?: string
    /** CODE.AWS username. */
    readonly cawsUsername?: string
    /** CODE.AWS secret. */
    readonly cawsSecret?: string
    /** Developer-mode settings */
    readonly developerMode: Set<string>
}

/**
 * Represents the current AWS credentials, CODE.AWS credentials, and zero or
 * more regions.
 */
export type AwsContext = ClassToInterfaceType<DefaultAwsContext>

export class NoActiveCredentialError extends Error {
    public message = 'No AWS profile selected'
}

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
    private developerMode = new Set<string>()

    public constructor(private context: vscode.ExtensionContext) {
        this._onDidChangeContext = new vscode.EventEmitter<ContextChangeEventsArgs>()
        this.onDidChangeContext = this._onDidChangeContext.event

        const persistedRegions = context.globalState.get<string[]>(regionSettingKey)
        this.explorerRegions = persistedRegions || []
    }

    /**
     * Sets the credentials to be used by the Toolkit.
     * Passing in undefined represents that there are no active credentials.
     *
     * @param credentials  Sets the Toolkit global credentials
     * @param force  Force emit of "changed" event (useful on startup)
     */
    public async setCredentials(credentials?: AwsContextCredentials, force?: boolean): Promise<void> {
        if (!force && JSON.stringify(this.credentials) === JSON.stringify(credentials)) {
            // Do nothing. Besides performance, this avoids infinite loops.
            return
        }
        this.credentials = credentials
        this.emitEvent()
    }

    /**
     * Sets "developer mode" when a Toolkit developer setting is active.
     *
     * @param enable  Set "developer mode" as enabled or disabled
     * @param settingName  Name of the detected setting, or undefined for `enable=false`.
     */
    public async setDeveloperMode(enable: boolean, settingName: string | undefined): Promise<void> {
        const enabled = this.developerMode.size > 0
        if (enable === enabled && (!enable || this.developerMode.has(settingName ?? '?'))) {
            // Do nothing. Besides performance, this avoids infinite loops.
            return
        }

        if (!enable) {
            this.developerMode.clear()
        } else {
            this.developerMode.add(settingName ?? '?')
        }
        this.emitEvent()
    }

    /**
     * Gets the current AWS credentials.
     */
    public async getCredentials(): Promise<AWS.Credentials | undefined> {
        return this.credentials?.credentials
    }

    /** Sets the current CODE.AWS credentials, or undefined to logout. */
    public setCawsCredentials(username: string, secret: string): void {
        this.cawsUsername = username
        this.cawsSecret = secret
        this.emitEvent()
    }

    /** Gets the current CODE.AWS credentials. */
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
        // TODO(jmkeyes): skip this if the state did not actually change.
        this._onDidChangeContext.fire({
            profileName: this.credentials?.credentialsId,
            accountId: this.credentials?.accountId,
            developerMode: this.developerMode,
            cawsUsername: this.cawsUsername,
            cawsSecret: this.cawsSecret,
        })
    }
}
