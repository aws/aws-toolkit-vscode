/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

// Carries the current context data on events
export class ContextChangeEventsArgs {
    public constructor(public profileName: string | undefined, public regions: string[]) {
    }
}

// Represents a credential profile and zero or more regions.
export interface AwsContext {

    onDidChangeContext: vscode.Event<ContextChangeEventsArgs>

    getCredentials(): Promise<AWS.Credentials | undefined>

    // returns the configured profile, if any
    getCredentialProfileName(): string | undefined
    // resets the context to the indicated profile, saving it into settings
    setCredentialProfileName(profileName?: string): Promise<void>

    getExplorerRegions(): Promise<string[]>

    // adds one or more regions into the preferred set
    addExplorerRegion(...regions: string[]): Promise<void>
    // removes one or more regions from the user's preferred set
    removeExplorerRegion(...regions: string[]): Promise<void>
}
