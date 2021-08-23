/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AWS from '@aws-sdk/types'

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
}

/**
 * Represents the current AWS credentials, CODE.AWS credentials, and zero or
 * more regions.
 */
export interface AwsContext {
    onDidChangeContext: vscode.Event<ContextChangeEventsArgs>

    /** Gets the current AWS credentials. */
    getCredentials(): Promise<AWS.Credentials | undefined>
    /** Sets the current AWS credentials, or undefined to logout. */
    setCredentials(credentials?: AwsContextCredentials): Promise<void>

    // returns the configured profile, if any
    getCredentialProfileName(): string | undefined
    getCredentialAccountId(): string | undefined
    getCredentialDefaultRegion(): string
    getExplorerRegions(): Promise<string[]>

    // adds one or more regions into the preferred set
    addExplorerRegion(...regions: string[]): Promise<void>
    // removes one or more regions from the user's preferred set
    removeExplorerRegion(...regions: string[]): Promise<void>

    /** Gets the current CODE.AWS credentials. */
    getCawsCredentials(): string | undefined
    /** Sets the current CODE.AWS credentials, or undefined to logout. */
    setCawsCredentials(username: string, secret: string): void
}

export class NoActiveCredentialError extends Error {
    public message = 'No AWS profile selected'
}
