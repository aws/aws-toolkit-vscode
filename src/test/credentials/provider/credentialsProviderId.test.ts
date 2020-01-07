/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    makeCredentialsProviderId,
    makeCredentialsProviderIdComponents
} from '../../../credentials/providers/credentialsProviderId'
import { assertThrowsError } from '../../shared/utilities/assertUtils'

describe('makeCredentialsProviderIdComponents', async () => {
    it('splits a CredentialsProviderId into components', async () => {
        const components = makeCredentialsProviderIdComponents('profile:default')

        assert.strictEqual(components.credentialType, 'profile')
        assert.strictEqual(components.credentialTypeId, 'default')
    })

    it('errs on unexpected format - not enough separators', async () => {
        await assertThrowsError(async () => {
            makeCredentialsProviderIdComponents('default')
        })
    })

    it('errs on unexpected format - different separator', async () => {
        await assertThrowsError(async () => {
            makeCredentialsProviderIdComponents('profile|default')
        })
    })
})

describe('makeCredentialsProviderId', async () => {
    it('makes a CredentialsProviderId', async () => {
        const id = makeCredentialsProviderId({
            credentialType: 'profile',
            credentialTypeId: 'default'
        })

        assert.strictEqual(id, 'profile:default')
    })
})
