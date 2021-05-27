/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { asString, fromString, isEqual } from '../../../credentials/providers/credentialsProviderId'

describe('CredentialsProviderId', async function () {
    describe('fromString', async function () {
        it('produces CredentialsProviderId from a string', async function () {
            const id = fromString('profile:default')

            assert.strictEqual(id.credentialType, 'profile')
            assert.strictEqual(id.credentialTypeId, 'default')
        })

        it('supports cases where the separator is in the credentialTypeId', async function () {
            const id = fromString('profile:default:foo')

            assert.strictEqual(id.credentialType, 'profile')
            assert.strictEqual(id.credentialTypeId, 'default:foo')
        })

        it('errs on unexpected format - not enough separators', async function () {
            assert.throws(() => fromString('default'))
        })

        it('errs on unexpected format - different separator', async function () {
            assert.throws(() => fromString('profile$default'))
        })
    })

    describe('asString', async function () {
        it('converts a CredentialsProviderId to a string', async function () {
            const id = asString({
                credentialType: 'profile',
                credentialTypeId: 'default',
            })

            assert.strictEqual(id, 'profile:default')
        })
    })

    describe('isEqual', async function () {
        it('detects matches', async function () {
            assert.strictEqual(
                isEqual(
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello',
                    },
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello',
                    }
                ),
                true
            )
        })

        it('detects non-matches in credentialType', async function () {
            assert.strictEqual(
                isEqual(
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello',
                    },
                    {
                        credentialType: 'test2',
                        credentialTypeId: 'hello',
                    }
                ),
                false
            )
        })

        it('detects non-matches in credentialTypeId', async function () {
            assert.strictEqual(
                isEqual(
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello',
                    },
                    {
                        credentialType: 'test',
                        credentialTypeId: 'hello2',
                    }
                ),
                false
            )
        })
    })
})
