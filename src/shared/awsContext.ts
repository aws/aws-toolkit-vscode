/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AWS from '@aws-sdk/types'
import { regionSettingKey } from './constants'
import { getLogger } from '../shared/logger'
import { ClassToInterfaceType } from './utilities/tsUtils'
import { CredentialsShim } from '../credentials/loginManager'

export interface AwsContextCredentials {
    readonly credentials: AWS.Credentials
    readonly credentialsId: string
    readonly accountId?: string
    readonly defaultRegion?: string
}

export interface ContextChangeEventsArgs {
    readonly profileName?: string
    readonly accountId?: string
    readonly status: 'enabled' | 'running' | 'disabled'
}

// Represents a credential profile and zero or more regions.
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
    // public readonly onDidChangeStatus: vscode.Event<StatusChangeEventArgs>
    // private readonly _onDidChangeStatus: vscode.EventEmitter<StatusChangeEventArgs>
    private shim?: CredentialsShim

    // the collection of regions the user has expressed an interest in working with in
    // the current workspace
    private readonly explorerRegions: string[]

    private currentCredentials: AwsContextCredentials | undefined
    private codewhispererStatus: 'enabled' | 'running' | 'disabled' = 'disabled'

    public constructor(private context: vscode.ExtensionContext) {
        this._onDidChangeContext = new vscode.EventEmitter<ContextChangeEventsArgs>()
        this.onDidChangeContext = this._onDidChangeContext.event

        // this._onDidChangeStatus= new vscode.EventEmitter<StatusChangeEventArgs>()
        // this.onDidChangeStatus = this._onDidChangeStatus.event

        const persistedRegions = context.globalState.get<string[]>(regionSettingKey)
        this.explorerRegions = persistedRegions || []
    }

    public get credentialsShim(): CredentialsShim | undefined {
        return this.shim
    }

    public set credentialsShim(shim: CredentialsShim | undefined) {
        this.shim = shim
    }

    /**
     * Sets the credentials to be used by the Toolkit.
     * Passing in undefined represents that there are no active credentials.
     *
     * @param credentials  Sets the Toolkit global credentials
     * @param force  Force emit of "changed" event (useful on startup)
     */
    public async setCredentials(credentials?: AwsContextCredentials, force?: boolean): Promise<void> {
        if (!force && JSON.stringify(this.currentCredentials) === JSON.stringify(credentials)) {
            // Do nothing. Besides performance, this avoids infinite loops.
            return
        }
        this.currentCredentials = credentials
        this.emitEvent()
    }

    /**
     * @description Gets the Credentials currently used by the Toolkit.
     */
    public async getCredentials(): Promise<AWS.Credentials | undefined> {
        return (
            this.shim?.get().catch(error => {
                getLogger().warn(`credentials: failed to retrieve latest credentials: ${error.message}`)
                return undefined
            }) ?? this.currentCredentials?.credentials
        )
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

    public async getExplorerRegions(): Promise<string[]> {
        // (1a63f2a5fe05) "async to potentially support other ways of obtaining regions, e.g. from EC2 IMDS."
        return this.explorerRegions
    }

    /**
     * Adds a region(s) into the "preferred set", persisted as a comma-separated string.
     *
     * @param regions List of region ids (like `["us-west-2"]`)
     */
    public async addExplorerRegion(...regions: string[]): Promise<void> {
        regions.forEach(r => {
            const index = this.explorerRegions.findIndex(regionToProcess => regionToProcess === r)
            if (index === -1) {
                this.explorerRegions.push(r)
            }
        })
        await this.context.globalState.update(regionSettingKey, this.explorerRegions)
    }

    /**
     * Removes a region(s) from the user's "preferred set".
     *
     * @param regions List of region ids (like `["us-west-2"]`)
     */
    public async removeExplorerRegion(...regions: string[]): Promise<void> {
        regions.forEach(r => {
            const index = this.explorerRegions.findIndex(explorerRegion => explorerRegion === r)
            if (index >= 0) {
                this.explorerRegions.splice(index, 1)
            }
        })

        await this.context.globalState.update(regionSettingKey, this.explorerRegions)
    }

    public getCodewhispererStatus() {
        return this.codewhispererStatus
    }

    public setCodewhispererStatus(status: 'enabled' | 'running' | 'disabled') {
        // if (this.codewhispererStatus === status) {
        //     return
        // }
        this.codewhispererStatus = status
        this.emitEvent()
    }

    private emitEvent() {
        // TODO(jmkeyes): skip this if the state did not actually change.
        this._onDidChangeContext.fire({
            profileName: this.currentCredentials?.credentialsId,
            accountId: this.currentCredentials?.accountId,
            status: this.codewhispererStatus,
        })
    }
}
