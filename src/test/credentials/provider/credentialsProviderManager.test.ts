/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CredentialSourceId } from '../../../shared/telemetry/telemetry.gen'
import { CredentialsProvider } from '../../../credentials/providers/credentialsProvider'
import { CredentialsProviderFactory } from '../../../credentials/providers/credentialsProviderFactory'
import { CredentialsProviderId, isEqual } from '../../../credentials/providers/credentialsProviderId'
import { CredentialsProviderManager } from '../../../credentials/providers/credentialsProviderManager'

/**
 * This class helps testing by producing placeholder CredentialsProviders
 */
class TestCredentialsProviderFactory implements CredentialsProviderFactory {
    private readonly providers: CredentialsProvider[] = []

    public constructor(public readonly credentialType: CredentialSourceId, providerSubIds: string[]) {
        this.providers.push(
            ...providerSubIds.map<CredentialsProvider>(subId => {
                return ({
                    getCredentialsProviderId: () => ({
                        credentialType: this.credentialType,
                        credentialTypeId: subId,
                    }),
                } as any) as CredentialsProvider
            })
        )
    }

    public getCredentialType(): CredentialSourceId {
        return this.credentialType
    }

    public listProviders(): CredentialsProvider[] {
        return this.providers
    }

    public getProvider(credentialsProviderId: CredentialsProviderId): CredentialsProvider | undefined {
        const providers = this.providers.filter(p => isEqual(p.getCredentialsProviderId(), credentialsProviderId))

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
        const factoryA = new TestCredentialsProviderFactory('sharedCredentials', ['one'])
        const factoryB = new TestCredentialsProviderFactory('envVars', ['two', 'three'])
        sut.addProviderFactory(factoryA)
        sut.addProviderFactory(factoryB)

        const expectedCredentials = {
            'sharedCredentials:one': {
                credentialType: 'sharedCredentials',
                credentialTypeId: 'one',
            },
            'envVars:three': {
                credentialType: 'envVars',
                credentialTypeId: 'three',
            },
            'envVars:two': {
                credentialType: 'envVars',
                credentialTypeId: 'two',
            },
        }
        assert.deepStrictEqual(expectedCredentials, await sut.getCredentialProviderNames())
    })

    describe('getAllCredentialsProviders', async function () {
        it('returns all providers', async function () {
            const factoryA = new TestCredentialsProviderFactory('sharedCredentials', ['one'])
            const factoryB = new TestCredentialsProviderFactory('envVars', ['two', 'three'])

            sut.addProviderFactory(factoryA)
            sut.addProviderFactory(factoryB)

            const providers = await sut.getAllCredentialsProviders()

            assert.strictEqual(providers.length, 3, 'Manager did not return the expected number of providers')
            assert.ok(
                providers.some(x =>
                    isEqual(x.getCredentialsProviderId(), {
                        credentialType: 'sharedCredentials',
                        credentialTypeId: 'one',
                    })
                ),
                'Manager did not return the first provider'
            )
            assert.ok(
                providers.some(x =>
                    isEqual(x.getCredentialsProviderId(), {
                        credentialType: 'envVars',
                        credentialTypeId: 'two',
                    })
                ),
                'Manager did not return the second provider'
            )
            assert.ok(
                providers.some(x =>
                    isEqual(x.getCredentialsProviderId(), {
                        credentialType: 'envVars',
                        credentialTypeId: 'three',
                    })
                ),
                'Manager did not return the third provider'
            )
        })
    })

    describe('getCredentialsProvider', async function () {
        it('returns a provider', async function () {
            const factoryA = new TestCredentialsProviderFactory('sharedCredentials', ['default'])
            const expectedCredentialsProviderId: CredentialsProviderId = {
                credentialType: 'sharedCredentials',
                credentialTypeId: 'default',
            }

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider(expectedCredentialsProviderId)

            assert.notStrictEqual(provider, undefined, 'Manager did not return a provider')
            assert.deepStrictEqual(
                provider?.getCredentialsProviderId(),
                expectedCredentialsProviderId,
                'Manager did not return the expected provider'
            )
        })

        it('returns undefined when there is a factory but the factory does not contain a provider', async function () {
            const factoryA = new TestCredentialsProviderFactory('sharedCredentials', ['default2'])

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider({
                credentialType: 'sharedCredentials',
                credentialTypeId: 'default',
            })

            assert.strictEqual(provider, undefined, 'Manager was not supposed to return a provider')
        })

        it('returns undefined when there is not a factory for the given credentialsType', async function () {
            const factoryA = new TestCredentialsProviderFactory('ec2', ['instance'])

            sut.addProviderFactory(factoryA)

            const provider = await sut.getCredentialsProvider({
                credentialType: 'sharedCredentials',
                credentialTypeId: 'default',
            })

            assert.strictEqual(provider, undefined, 'Manager was not supposed to return a provider')
        })
    })
})
