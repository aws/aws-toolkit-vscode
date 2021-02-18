/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsProviderId } from './credentialsProviderId'

export interface CredentialsProvider {
    getCredentialsProviderId(): CredentialsProviderId
    getDefaultRegion(): string | undefined
    getHashCode(): string
    getCredentials(): Promise<AWS.Credentials>
    canAutoConnect(): boolean
}
