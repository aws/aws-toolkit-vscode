/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CredentialsProvider } from '../../../credentials/providers/credentialsProvider'
import { CredentialsProviderFactory } from '../../../credentials/providers/credentialsProviderFactory'
import { makeCredentialsProviderId } from '../../../credentials/providers/credentialsProviderId'
import { CredentialsProviderManager } from '../../../credentials/providers/credentialsProviderManager'

/**
 * This class helps testing by producing placeholder CredentialsProviders
 */
class TestCredentialsProviderFactory implements CredentialsProviderFactory {
    private readonly providers: CredentialsProvider[] = []

    public constructor(public readonly credentialType: string, providerSubIds: string[]) {
        this.providers.push(
            ...providerSubIds.map<CredentialsProvider>(subId => {
                return ({
                    getCredentialsProviderId: () =>
                        makeCredentialsProviderId({
                            credentialType: this.credentialType,
                            credentialTypeId: subId
                        })
                } as any) as CredentialsProvider
            })
        )
    }

    public getCredentialType(): string {
        return this.credentialType
    }

    public listProviders(): CredentialsProvider[] {
        return this.providers
    }

    public getProvider(credentialsProviderId: string): CredentialsProvider | undefined {
        const providers = this.providers.filter(p => p.getCredentialsProviderId() === credentialsProviderId)

        if (providers.length === 0) {
            return undefined
        }

        return providers[0]
    }

    public async refresh(): Promise<void> {}
}

describe('CredentialsProviderManager', async () => {
    let sut: CredentialsProviderManager

    beforeEach(async () => {
        sut = new CredentialsProviderManager()
    })

    describe('getAllCredentialsProviders', async () => {
        it('returns all providers', async () => {
            const factoryA = new TestCredentialsProviderFactory('credentialTypeA', ['one'])
            const factoryB = new TestCredentialsProviderFactory('credentialTypeB', ['two', 'three'])

            sut.addProviderFactory(factoryA)
            sut.addProviderFactory(factoryB)

            const providers = await sut.getAllCredentialsProviders()

            assert.strictEqual(providers.length, 3, 'Manager did not return the expected number of providers')
            assert.ok(
                providers.some(x => x.getCredentialsProviderId() === 'credentialTypeA:one'),
                'Manager did not return the first provider'
            )
            assert.ok(
                providers.some(x => x.getCredentialsProviderId() === 'credentialTypeB:two'),
                'Manager did not return the second provider'
            )
            assert.ok(
                providers.some(x => x.getCredentialsProviderId() === 'credentialTypeB:three'),
                'Manager did not return the third provider'
            )
        })
    })

    describe('getCredentialsProvider', async () => {
        it('returns a provider', async () => {
            const factoryA = new TestCredentialsProviderFactory('profile', ['default'])

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider('profile:default')

            assert.notStrictEqual(provider, undefined, 'Manager did not return a provider')
            assert.strictEqual(
                provider?.getCredentialsProviderId(),
                'profile:default',
                'Manager did not return the expected provider'
            )
        })

        it('returns undefined when there is a factory but the factory does not contain a provider', async () => {
            const factoryA = new TestCredentialsProviderFactory('profile', ['default2'])

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider('profile:default')

            assert.strictEqual(provider, undefined, 'Manager was not supposed to return a provider')
        })

        it('returns undefined when there is not a factory for the given credentialsType', async () => {
            const factoryA = new TestCredentialsProviderFactory('ec2', ['instance'])

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider('profile:default')

            assert.strictEqual(provider, undefined, 'Manager was not supposed to return a provider')
        })
    })
})
