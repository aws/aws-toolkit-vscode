/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export abstract class CredentialProviderChainProvider {
    public abstract getCredentialsProviderId(): string
    public abstract async getCredentialProviderChain(): Promise<AWS.CredentialProviderChain>
}
