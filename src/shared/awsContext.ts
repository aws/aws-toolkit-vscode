'use strict'

import * as vscode from 'vscode'
import { ContextChangeEventsArgs } from './defaultAwsContext'

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
    addExplorerRegion(region: string | string[]): Promise<void>
    // removes one or more regions from the user's preferred set
    removeExplorerRegion(region: string | string[]): Promise<void>
}
