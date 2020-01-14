/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { asString, fromString, isEqual } from '../../../credentials/providers/credentialsProviderId'
import { assertThrowsError } from '../../shared/utilities/assertUtils'

describe('CredentialsProviderId', async () => {
    describe('fromString', async () => {
        it('produces CredentialsProviderId from a string', async () => {
            const id = fromString('profile:default')

            assert.strictEqual(id.credentialType, 'profile')
            assert.strictEqual(id.credentialTypeId, 'default')
        })

        it('supports cases where the separator is in the credentialTypeId', async () => {
            const id = fromString('profile:default:foo')

            assert.strictEqual(id.credentialType, 'profile')
            assert.strictEqual(id.credentialTypeId, 'default:foo')
        })

        it('errs on unexpected format - not enough separators', async () => {
            await assertThrowsError(async () => {
                fromString('default')
            })
        })

        it('errs on unexpected format - different separator', async () => {
            await assertThrowsError(async () => {
                fromString('profile$default')
            })
        })
    })

    describe('asString', async () => {
        it('converts a CredentialsProviderId to a string', async () => {
            const id = asString({
                credentialType: 'profile',
                credentialTypeId: 'default'
            })

            assert.strictEqual(id, 'profile:default')
        })
    })

    describe('isEqual', async () => {
        it('detects matches', async () => {
            assert.strictEqual(
                isEqual(
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello'
                    },
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello'
                    }
                ),
                true
            )
        })

        it('detects non-matches in credentialType', async () => {
            assert.strictEqual(
                isEqual(
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello'
                    },
                    {
                        credentialType: 'test2',
                        credentialTypeId: 'hello'
                    }
                ),
                false
            )
        })

        it('detects non-matches in credentialTypeId', async () => {
            assert.strictEqual(
                isEqual(
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello'
                    },
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello2'
                    }
                ),
                false
            )
        })
    })
})
