/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger';
import { BaseCredentialsProviderFactory } from "./credentialsProviderFactory";
import { Ec2CredentialsProvider } from "./ec2CredentialsProvider";
import { EnvironmentCredentialsProvider } from "./environmentCredentialsProvider";
import { EnvVarsCredentialsProvider } from './envVarsCredentialsProvider';

export class EnvironmentCredentialsProviderFactory extends BaseCredentialsProviderFactory<EnvironmentCredentialsProvider> {
    private static readonly DEFAULT_PROVIDERS = [
        new Ec2CredentialsProvider(),
        new EnvVarsCredentialsProvider()
    ]

    private isInitialized: boolean = false

    public constructor(
        private registeredProviders: EnvironmentCredentialsProvider[] = EnvironmentCredentialsProviderFactory.DEFAULT_PROVIDERS
    ) {
        super()
    }

    public async refresh(): Promise<void> {
        // currently not refreshing since fundamental environment should not change during runtime
        if (!this.isInitialized) {
            await this.loadEnvironmentProviders()
            this.isInitialized = true
        }
    }

    private async loadEnvironmentProviders(): Promise<void> {
        this.resetProviders()

        await Promise.all(
            this.registeredProviders.map(async provider => {
                if (await provider.isAvailable()) {
                    this.addProvider(provider)
                    getLogger().verbose(
                        `registered provider for ${provider.getCredentialsId().credentialTypeId}`
                    )
                } else {
                    getLogger().verbose(
                        `provider for ${provider.getCredentialsId().credentialTypeId} unavailable in this environment`
                    )
                }
            })
        )
        getLogger().verbose(`using environment credentials providers: ${this.listProviders()}`)
    }
}
