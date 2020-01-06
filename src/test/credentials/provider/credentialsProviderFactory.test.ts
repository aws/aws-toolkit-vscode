/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CredentialProviderChainProvider } from '../../../credentials/providers/credentialProviderChainProvider'
import { BaseCredentialsProviderFactory } from '../../../credentials/providers/credentialsProviderFactory'

describe.only('BaseCredentialsProviderFactory', async () => {
    /**
     * This class exposes abstract class functionality for the purpose of testing it.
     */
    class TestCredentialsProviderFactory extends BaseCredentialsProviderFactory<CredentialProviderChainProvider> {
        public getCredentialType(): string {
            return 'sample'
        }

        public getProviders(): CredentialProviderChainProvider[] {
            return this.providers
        }

        public async refresh(): Promise<void> {}

        public addProvider(provider: CredentialProviderChainProvider) {
            super.addProvider(provider)
        }

        public removeProvider(provider: CredentialProviderChainProvider) {
            super.removeProvider(provider)
        }

        public resetProviders() {
            super.resetProviders()
        }
    }

    let sut: TestCredentialsProviderFactory

    beforeEach(async () => {
        sut = new TestCredentialsProviderFactory()
    })

    it('can add a provider', async () => {
        sut.addProvider(makeSampleCredentialProviderChainProvider('provider1'))
        assert.strictEqual(sut.getProviders().length, 1)
    })

    it('can remove a provider', async () => {
        const provider = makeSampleCredentialProviderChainProvider('provider1')
        sut.getProviders().push(provider)
        sut.removeProvider(provider)
        assert.strictEqual(sut.getProviders().length, 0)
    })

    it('can reset providers', async () => {
        const provider = makeSampleCredentialProviderChainProvider('provider1')
        sut.getProviders().push(provider)
        sut.resetProviders()
        assert.strictEqual(sut.getProviders().length, 0)
    })

    it('can list providers', async () => {
        const provider = makeSampleCredentialProviderChainProvider('provider1')
        const provider2 = makeSampleCredentialProviderChainProvider('provider2')
        sut.getProviders().push(provider)
        sut.getProviders().push(provider2)

        const providers = sut.listProviders()
        assert.strictEqual(providers.length, 2)
        assert.notStrictEqual(providers.indexOf(provider), -1, 'Expected provider 1 to be in listed providers')
        assert.notStrictEqual(providers.indexOf(provider2), -1, 'Expected provider 2 to be in listed providers')
    })

    it('returns a requested provider', async () => {
        const provider = makeSampleCredentialProviderChainProvider('provider1')
        sut.getProviders().push(provider)

        const retrievedProvider = sut.getProvider('provider1')
        assert.notStrictEqual(retrievedProvider, undefined)
    })

    it('returns undefined when requesting a provider it does not have', async () => {
        const provider = makeSampleCredentialProviderChainProvider('provider1')
        sut.getProviders().push(provider)

        const retrievedProvider = sut.getProvider('provider2')
        assert.strictEqual(retrievedProvider, undefined)
    })

    function makeSampleCredentialProviderChainProvider(credentialsProviderId: string): CredentialProviderChainProvider {
        return {
            getCredentialsProviderId: () => credentialsProviderId,
            getCredentialProviderChain: () => {
                throw new Error('not implemented')
            }
        }
    }
})
