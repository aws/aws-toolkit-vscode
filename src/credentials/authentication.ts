/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
