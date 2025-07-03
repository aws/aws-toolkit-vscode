/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as utils from '../../../../awsService/sagemaker/detached-server/utils'
import { resolveCredentialsFor } from '../../../../awsService/sagemaker/detached-server/credentials'

const connectionId = 'arn:aws:sagemaker:region:acct:space/name'

describe('resolveCredentialsFor', () => {
    afterEach(() => sinon.restore())

    it('throws if no profile is found', async () => {
        sinon.stub(utils, 'readMapping').resolves({ localCredential: {} })

        await assert.rejects(() => resolveCredentialsFor(connectionId), {
            message: `No profile found for "${connectionId}"`,
        })
    })

    it('throws if IAM profile name is malformed', async () => {
        sinon.stub(utils, 'readMapping').resolves({
            localCredential: {
                [connectionId]: {
                    type: 'iam',
                    profileName: 'dev-profile', // no colon
                },
            },
        })

        await assert.rejects(() => resolveCredentialsFor(connectionId), {
            message: `Invalid IAM profile name for "${connectionId}"`,
        })
    })

    it('resolves SSO credentials correctly', async () => {
        sinon.stub(utils, 'readMapping').resolves({
            localCredential: {
                [connectionId]: {
                    type: 'sso',
                    accessKey: 'key',
                    secret: 'sec',
                    token: 'tok',
                },
            },
        })

        const creds = await resolveCredentialsFor(connectionId)
        assert.deepStrictEqual(creds, {
            accessKeyId: 'key',
            secretAccessKey: 'sec',
            sessionToken: 'tok',
        })
    })

    it('throws if SSO credentials are incomplete', async () => {
        sinon.stub(utils, 'readMapping').resolves({
            localCredential: {
                [connectionId]: {
                    type: 'sso',
                    accessKey: 'key',
                    secret: 'sec',
                    token: '', // token is required but intentionally left empty for this test
                },
            },
        })

        await assert.rejects(() => resolveCredentialsFor(connectionId), {
            message: `Missing SSO credentials for "${connectionId}"`,
        })
    })

    it('throws for unsupported profile types', async () => {
        sinon.stub(utils, 'readMapping').resolves({
            localCredential: {
                [connectionId]: {
                    type: 'unknown',
                } as any,
            },
        })

        await assert.rejects(() => resolveCredentialsFor(connectionId), {
            message: /Unsupported profile type/, // don't hard-code full value since object might be serialized
        })
    })
})
