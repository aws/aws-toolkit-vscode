/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { BaseCredentialsProviderFactory } from '../../../auth/providers/credentialsProviderFactory'
import { CredentialsProvider, CredentialsProviderType, CredentialsId } from '../../../auth/providers/credentials'

describe('BaseCredentialsProviderFactory', async function () {
    /**
     * This class exposes abstract class functionality for the purpose of testing it.
     */
    class TestCredentialsProviderFactory extends BaseCredentialsProviderFactory<CredentialsProvider> {
        public override getProviderType(): CredentialsProviderType {
            return 'profile'
        }

        public getProviders(): CredentialsProvider[] {
            return this.providers
        }

        public async refresh(): Promise<void> {}

        public override addProvider(provider: CredentialsProvider) {
            super.addProvider(provider)
        }

        public override removeProvider(provider: CredentialsProvider) {
            super.removeProvider(provider)
        }

        public override resetProviders() {
            super.resetProviders()
        }
    }

    let sut: TestCredentialsProviderFactory

    beforeEach(async function () {
        sut = new TestCredentialsProviderFactory()
    })

    it('can add a provider', async function () {
        sut.addProvider(makeSampleCredentialsProvider('provider1'))
        assert.strictEqual(sut.getProviders().length, 1)
    })

    it('can remove a provider', async function () {
        const provider = makeSampleCredentialsProvider('provider1')
        sut.getProviders().push(provider)
        sut.removeProvider(provider)
        assert.strictEqual(sut.getProviders().length, 0)
    })

    it('can reset providers', async function () {
        const provider = makeSampleCredentialsProvider('provider1')
        sut.getProviders().push(provider)
        sut.resetProviders()
        assert.strictEqual(sut.getProviders().length, 0)
    })

    it('can list providers', async function () {
        const provider = makeSampleCredentialsProvider('provider1')
        const provider2 = makeSampleCredentialsProvider('provider2')
        sut.getProviders().push(provider)
        sut.getProviders().push(provider2)

        const providers = sut.listProviders()
        assert.strictEqual(providers.length, 2)
        assert.notStrictEqual(providers.indexOf(provider), -1, 'Expected provider 1 to be in listed providers')
        assert.notStrictEqual(providers.indexOf(provider2), -1, 'Expected provider 2 to be in listed providers')
    })

    it('returns a requested provider', async function () {
        const provider = makeSampleCredentialsProvider('provider1')
        sut.getProviders().push(provider)

        const retrievedProvider = sut.getProvider(makeSampleCredentialsId('provider1'))
        assert.notStrictEqual(retrievedProvider, undefined)
    })

    it('returns undefined when requesting a provider it does not have', async function () {
        const provider = makeSampleCredentialsProvider('provider1')
        sut.getProviders().push(provider)

        const retrievedProvider = sut.getProvider(makeSampleCredentialsId('provider2'))
        assert.strictEqual(retrievedProvider, undefined)
    })

    function makeSampleCredentialsId(testProviderId: string): CredentialsId {
        return {
            credentialSource: 'profile',
            credentialTypeId: testProviderId,
        }
    }

    function makeSampleCredentialsProvider(testProviderId: string): CredentialsProvider {
        return {
            getCredentialsId: () => makeSampleCredentialsId(testProviderId),
        } as any as CredentialsProvider
    }
})
