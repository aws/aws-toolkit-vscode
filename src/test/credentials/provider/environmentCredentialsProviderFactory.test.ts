/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EnvironmentCredentialsProviderFactory } from '../../..//credentials/providers/environmentCredentialsProviderFactory'
import { CredentialsId } from '../../../credentials/providers/credentials'
import { EnvironmentCredentialsProvider } from '../../../credentials/providers/environmentCredentialsProvider'
import { instance, mock, when } from '../../utilities/mockito'

describe('EnvironmentCredentialsProviderFactory', () => {
    const mockProviderId = {
        credentialSource: 'profile',
        credentialTypeId:'dummyTypeId'
    } as CredentialsId

    let mockProvider: EnvironmentCredentialsProvider
    let factory: EnvironmentCredentialsProviderFactory

    beforeEach(function() {
        mockProvider = mock()
        when(mockProvider.getCredentialsId()).thenReturn(mockProviderId)
        factory = new EnvironmentCredentialsProviderFactory([instance(mockProvider)])
    })

    it('returns valid providers', async () => {
        when(mockProvider.isAvailable()).thenReturn(Promise.resolve(true))
        await factory.refresh()
        const providers = factory.listProviders()
        assert.strictEqual(providers.length, 1)
        assert.strictEqual(providers[0].getCredentialsId(), mockProviderId)
    })

    it('excludes invalid providers', async () => {
        when(mockProvider.isAvailable()).thenReturn(Promise.resolve(false))
        await factory.refresh()
        const providers = factory.listProviders()
        assert.strictEqual(providers.length, 0)
    })
})
