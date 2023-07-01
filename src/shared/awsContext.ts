/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AWS from '@aws-sdk/types'
import { getLogger } from '../shared/logger'
import { ClassToInterfaceType } from './utilities/tsUtils'
import { CredentialsShim } from '../auth/deprecated/loginManager'
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
}

/**
 * Represents the current AWS credentials and zero or more regions.
 */
export type AwsContext = ClassToInterfaceType<DefaultAwsContext>

const logged = new Set<string>()
const defaultRegion = 'us-east-1'

/**
 * Wraps an AWS context in terms of credential profile and zero or more regions. The
 * context listens for configuration updates and resets the context accordingly.
 */
export class DefaultAwsContext implements AwsContext {
    public readonly onDidChangeContext: vscode.Event<ContextChangeEventsArgs>
    private readonly _onDidChangeContext: vscode.EventEmitter<ContextChangeEventsArgs>
    private shim?: CredentialsShim
    public lastTouchedRegion?: string

    private currentCredentials: AwsContextCredentials | undefined

    public constructor() {
        this._onDidChangeContext = new vscode.EventEmitter<ContextChangeEventsArgs>()
        this.onDidChangeContext = this._onDidChangeContext.event
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
                `AwsContext: no default region in credentials profile, falling back to ${defaultRegion}: ${credId}`
            )
        }

        return this.currentCredentials?.defaultRegion ?? defaultRegion
    }

    private emitEvent() {
        // TODO(jmkeyes): skip this if the state did not actually change.
        this._onDidChangeContext.fire({
            profileName: this.currentCredentials?.credentialsId,
            accountId: this.currentCredentials?.accountId,
        })
    }
}
