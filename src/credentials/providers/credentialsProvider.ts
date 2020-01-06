/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CredentialsProvider {
    getCredentialsProviderId(): string
    getDefaultRegion(): string | undefined
    getHashCode(): number
    getCredentials(): Promise<AWS.Credentials>
}
