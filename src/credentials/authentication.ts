/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AsyncCollection } from '../shared/utilities/asyncCollection'

// The interfaces here should look very similar to the VS Code API (that wasn't by accident!)

export interface AccountDetails {
    /**
     * Unique identifier for the account in the context of the account type
     */
    readonly id: string

    /**
     * Human-friendly name for the account
     */
    readonly label: string

    /**
     * Describes how the account information was derived
     */
    readonly source?: string
}

export interface Session<T = string, U extends AccountDetails = AccountDetails> {
    /**
     * Unique identifier associated with this specific session.
     */
    readonly id: string

    /**
     * Describes a structure containing sensitive data to be used for authentication
     *
     * This is a generalization of an 'accessToken'
     */
    readonly accessDetails: T

    /**
     * Describes a structure containing basic information about the account from which this session was derived from
     */
    readonly accountDetails: U
}

export interface AuthenticationSessionsChangeEvent<T = Session<string, AccountDetails>> {
    readonly added?: T[]
    readonly changed?: T[]
    readonly removed?: T[]
}

// An 'account' is something you login to
// A 'session' is what you get after being logged in
// So for AWS credentials, an 'account' could be a single profile, while the 'session' is the actual credentials
// For CAWS, an 'account' is your email/username, the 'session' is the cookie (and eventually, OIDC token(s))

export interface AuthenticationProvider<T = string, U extends AccountDetails = AccountDetails> {
    readonly onDidChangeSessions?: vscode.Event<AuthenticationSessionsChangeEvent<Session<T, U>>>
    listAccounts(): AsyncCollection<U> | Promise<U[]> | U[]
    listSessions(): AsyncCollection<Session<T, U>> | Promise<Session<T, U>[]> | Session<T, U>[]
    createSession(account: U): Promise<Session<T, U>> | Session<T, U>
    deleteSession(session: Session<T, U>): Promise<void> | void
}
