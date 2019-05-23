/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

// Carries the current context data on events
export class ContextChangeEventsArgs {
    public constructor(
        public readonly profileName: string | undefined,
        public readonly accountId: string | undefined,
        public readonly regions: string[]
    ) {}
}

// Represents a credential profile and zero or more regions.
export interface AwsContext {

    onDidChangeContext: vscode.Event<ContextChangeEventsArgs>

    // optionally accepts a profile to validate a profile that hasn't logged in yet
    getCredentials(profileName?: string): Promise<AWS.Credentials | undefined>

    // returns the configured profile, if any
    getCredentialProfileName(): string | undefined
    // resets the context to the indicated profile, saving it into settings
    setCredentialProfileName(profileName?: string): Promise<void>

    getCredentialAccountId(): string | undefined
    setCredentialAccountId(accountId?: string): Promise<void>

    getExplorerRegions(): Promise<string[]>

    // adds one or more regions into the preferred set
    addExplorerRegion(...regions: string[]): Promise<void>
    // removes one or more regions from the user's preferred set
    removeExplorerRegion(...regions: string[]): Promise<void>
}

export class NoActiveCredentialError extends Error {
    public message = 'No AWS profile selected'
}
