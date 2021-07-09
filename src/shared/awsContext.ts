/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export interface AwsContextCredentials {
    readonly credentials: AWS.Credentials
    readonly credentialsId: string
    readonly accountId?: string
    readonly defaultRegion?: string
}

// Carries the current context data on events
export interface ContextChangeEventsArgs {
    readonly profileName?: string
    readonly accountId?: string
}

// Represents a credential profile and zero or more regions.
export interface AwsContext {
    onDidChangeContext: vscode.Event<ContextChangeEventsArgs>

    setCredentials(credentials?: AwsContextCredentials): Promise<void>

    getCredentials(): Promise<AWS.Credentials | undefined>

    // returns the configured profile, if any
    getCredentialProfileName(): string | undefined

    getCredentialAccountId(): string | undefined

    getCredentialDefaultRegion(): string

    getExplorerRegions(): Promise<string[]>

    // adds one or more regions into the preferred set
    addExplorerRegion(...regions: string[]): Promise<void>
    // removes one or more regions from the user's preferred set
    removeExplorerRegion(...regions: string[]): Promise<void>
}

export class NoActiveCredentialError extends Error {
    public message = 'No AWS profile selected'
}
