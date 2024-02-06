/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CredentialsProviderFactory } from '../../../auth/providers/credentialsProviderFactory'
import {
    CredentialsProvider,
    CredentialsProviderType,
    CredentialsId,
    isEqual,
} from '../../../auth/providers/credentials'
import { CredentialsProviderManager } from '../../../auth/providers/credentialsProviderManager'

/**
 * This class helps testing by producing placeholder CredentialsProviders
 */
class TestCredentialsProviderFactory implements CredentialsProviderFactory {
    private readonly providers: CredentialsProvider[] = []

    public constructor(public readonly credentialSource: CredentialsProviderType, providerSubIds: string[]) {
        this.providers.push(
            ...providerSubIds.map<CredentialsProvider>(subId => {
                return makeSampleCredentialsProvider(this.credentialSource, subId, true)
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

        const availableProvider = makeSampleCredentialsProvider('profile', 'two', true)
        const unavailableProvider = makeSampleCredentialsProvider('profile', 'three', false)
        sut.addProviders(availableProvider, unavailableProvider)

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
            'profile:two': {
                credentialSource: 'profile',
                credentialTypeId: 'two',
            },
        }
        const actual = await sut.getCredentialProviderNames()
        assert.deepStrictEqual(expectedCredentials, actual)
    })

    describe('getAllCredentialsProviders', async function () {
        it('returns all providers', async function () {
            const factoryA = new TestCredentialsProviderFactory('profile', ['one'])
            const factoryB = new TestCredentialsProviderFactory('env', ['two', 'three'])

            sut.addProviderFactory(factoryA)
            sut.addProviderFactory(factoryB)

            const availableProvider = makeSampleCredentialsProvider('profile', 'two', true)
            const unavailableProvider = makeSampleCredentialsProvider('profile', 'three', false)
            sut.addProviders(availableProvider, unavailableProvider)

            const providers = await sut.getAllCredentialsProviders()

            assert.strictEqual(providers.length, 4, 'Manager did not return the expected number of providers')
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
            assert.ok(
                providers.some(x =>
                    isEqual(x.getCredentialsId(), {
                        credentialSource: 'profile',
                        credentialTypeId: 'two',
                    })
                ),
                'Manager did not return the fourth provider'
            )
        })
    })

    describe('getCredentialsProvider', async function () {
        it('returns a provider', async function () {
            const testProvider = makeSampleCredentialsProvider('profile', 'default', true)
            const expectedCredentialsId: CredentialsId = {
                credentialSource: 'profile',
                credentialTypeId: 'default',
            }

            sut.addProvider(testProvider)

            const provider = await sut.getCredentialsProvider(expectedCredentialsId)

            assert.notStrictEqual(provider, undefined, 'Manager did not return a provider')
            assert.deepStrictEqual(
                provider?.getCredentialsId(),
                expectedCredentialsId,
                'Manager did not return the expected provider'
            )
        })

        it('returns a provider from a factory', async function () {
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

        it('returns undefined when there is no provider for the given credentialsType', async function () {
            const testProvider = makeSampleCredentialsProvider('ec2', 'instance', true)

            sut.addProvider(testProvider)

            const provider = await sut.getCredentialsProvider({
                credentialSource: 'profile',
                credentialTypeId: 'default',
            })

            assert.strictEqual(provider, undefined, 'Manager was not supposed to return a provider')
        })

        it('returns undefined when the given credentialsType matches but provider is not available', async function () {
            const testProvider = makeSampleCredentialsProvider('profile', 'default', false)

            sut.addProvider(testProvider)

            const provider = await sut.getCredentialsProvider({
                credentialSource: 'profile',
                credentialTypeId: 'default',
            })

            assert.strictEqual(provider, undefined, 'Manager was not supposed to return a provider')
        })
    })
})

function makeSampleCredentialsProvider(
    testSource: string,
    testProviderId: string,
    available: boolean
): CredentialsProvider {
    return {
        getCredentialsId: () => {
            return {
                credentialSource: testSource,
                credentialTypeId: testProviderId,
            }
        },
        isAvailable: () => {
            return Promise.resolve(available)
        },
    } as any as CredentialsProvider
}
