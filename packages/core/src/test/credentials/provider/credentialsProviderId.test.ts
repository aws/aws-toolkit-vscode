/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { asString, fromString, isEqual } from '../../../auth/providers/credentials'

describe('CredentialsProviderId', async function () {
    describe('fromString', async function () {
        it('produces CredentialsProviderId from a string', async function () {
            const id = fromString('ec2:default')

            assert.strictEqual(id.credentialSource, 'ec2')
            assert.strictEqual(id.credentialTypeId, 'default')
        })

        it('supports cases where the separator is in the credentialTypeId', async function () {
            const id = fromString('ec2:default:foo')

            assert.strictEqual(id.credentialSource, 'ec2')
            assert.strictEqual(id.credentialTypeId, 'default:foo')
        })

        it('errs on unexpected format - not enough separators', async function () {
            assert.throws(() => fromString('default'))
        })

        it('errs on unexpected format - different separator', async function () {
            assert.throws(() => fromString('ec2$default'))
        })
    })

    describe('asString', async function () {
        it('converts a CredentialsProviderId to a string', async function () {
            const id = asString({
                credentialSource: 'profile',
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
                        credentialSource: 'profile',
                        credentialTypeId: 'hello',
                    },
                    {
                        credentialSource: 'profile',
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
                        credentialSource: 'profile',
                        credentialTypeId: 'hello',
                    },
                    {
                        credentialSource: 'ec2',
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
                        credentialSource: 'profile',
                        credentialTypeId: 'hello',
                    },
                    {
                        credentialSource: 'profile',
                        credentialTypeId: 'hello2',
                    }
                ),
                false
            )
        })
    })
})
