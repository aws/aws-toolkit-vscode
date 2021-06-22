/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CredentialsProviderFactory } from '../../../credentials/providers/credentialsProviderFactory'
import { CredentialsProvider, CredentialsProviderType ,CredentialsId, isEqual } from '../../../credentials/providers/credentials'
import { CredentialsProviderManager } from '../../../credentials/providers/credentialsProviderManager'

/**
 * This class helps testing by producing placeholder CredentialsProviders
 */
class TestCredentialsProviderFactory implements CredentialsProviderFactory {
    private readonly providers: CredentialsProvider[] = []

    public constructor(public readonly credentialSource: CredentialsProviderType, providerSubIds: string[]) {
        this.providers.push(
            ...providerSubIds.map<CredentialsProvider>(subId => {
                return ({
                    getCredentialsId: () => ({
                        credentialSource: this.credentialSource,
                        credentialTypeId: subId,
                    }),
                } as any) as CredentialsProvider
            })
        )
    }

    public getProviderType(): CredentialsProviderType {
        return this.credentialSource
    }

    public listProviders(): CredentialsProvider[] {
        return this.providers
    }

    public getProvider(credentialsProviderId: CredentialsId): CredentialsProvider | undefined {
        const providers = this.providers.filter(p => isEqual(p.getCredentialsId(), credentialsProviderId))

        if (providers.length === 0) {
            return undefined
        }

        return providers[0]
    }

    public async refresh(): Promise<void> {}
}

describe('CredentialsProviderManager', async function () {
    let sut: CredentialsProviderManager

    beforeEach(async function () {
        sut = new CredentialsProviderManager()
    })

    it('getCredentialProviderNames()', async function () {
        const factoryA = new TestCredentialsProviderFactory('profile', ['one'])
        const factoryB = new TestCredentialsProviderFactory('env', ['two', 'three'])
        sut.addProviderFactory(factoryA)
        sut.addProviderFactory(factoryB)

        const expectedCredentials = {
            'profile:one': {
                credentialSource: 'profile',
                credentialTypeId: 'one',
            },
            'env:three': {
                credentialSource: 'env',
                credentialTypeId: 'three',
            },
            'env:two': {
                credentialSource: 'env',
                credentialTypeId: 'two',
            },
        }
        assert.deepStrictEqual(expectedCredentials, await sut.getCredentialProviderNames())
    })

    describe('getAllCredentialsProviders', async function () {
        it('returns all providers', async function () {
            const factoryA = new TestCredentialsProviderFactory('profile', ['one'])
            const factoryB = new TestCredentialsProviderFactory('env', ['two', 'three'])

            sut.addProviderFactory(factoryA)
            sut.addProviderFactory(factoryB)

            const providers = await sut.getAllCredentialsProviders()

            assert.strictEqual(providers.length, 3, 'Manager did not return the expected number of providers')
            assert.ok(
                providers.some(x =>
                    isEqual(x.getCredentialsId(), {
                        credentialSource: 'profile',
                        credentialTypeId: 'one',
                    })
                ),
                'Manager did not return the first provider'
            )
            assert.ok(
                providers.some(x =>
                    isEqual(x.getCredentialsId(), {
                        credentialSource: 'env',
                        credentialTypeId: 'two',
                    })
                ),
                'Manager did not return the second provider'
            )
            assert.ok(
                providers.some(x =>
                    isEqual(x.getCredentialsId(), {
                        credentialSource: 'env',
                        credentialTypeId: 'three',
                    })
                ),
                'Manager did not return the third provider'
            )
        })
    })

    describe('getCredentialsProvider', async function () {
        it('returns a provider', async function () {
            const factoryA = new TestCredentialsProviderFactory('profile', ['default'])
            const expectedCredentialsId: CredentialsId = {
                credentialSource: 'profile',
                credentialTypeId: 'default',
            }

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider(expectedCredentialsId)

            assert.notStrictEqual(provider, undefined, 'Manager did not return a provider')
            assert.deepStrictEqual(
                provider?.getCredentialsId(),
                expectedCredentialsId,
                'Manager did not return the expected provider'
            )
        })

        it('returns undefined when there is a factory but the factory does not contain a provider', async function () {
            const factoryA = new TestCredentialsProviderFactory('profile', ['default2'])

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider({
                credentialSource: 'profile',
                credentialTypeId: 'default',
            })

            assert.strictEqual(provider, undefined, 'Manager was not supposed to return a provider')
        })

        it('returns undefined when there is not a factory for the given credentialsType', async function () {
            const factoryA = new TestCredentialsProviderFactory('ec2', ['instance'])

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider({
                credentialSource: 'profile',
                credentialTypeId: 'default',
            })

            assert.strictEqual(provider, undefined, 'Manager was not supposed to return a provider')
        })
    })
})
