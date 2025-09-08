/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as AWS from 'aws-sdk'
import { adaptConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/shared/client/credentialsAdapter'

describe('credentialsAdapter', function () {
    let sandbox: sinon.SinonSandbox
    let mockConnectionCredentialsProvider: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockConnectionCredentialsProvider = {
            getCredentials: sandbox.stub(),
        }
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('adaptConnectionCredentialsProvider', function () {
        it('should create CredentialProviderChain', function () {
            const chain = adaptConnectionCredentialsProvider(mockConnectionCredentialsProvider)
            assert.ok(chain instanceof AWS.CredentialProviderChain)
        })

        it('should create credentials with provider function', function () {
            const chain = adaptConnectionCredentialsProvider(mockConnectionCredentialsProvider)
            assert.ok(chain.providers)
            assert.strictEqual(chain.providers.length, 1)
            assert.strictEqual(typeof chain.providers[0], 'function')
        })

        it('should create AWS Credentials object', function () {
            const chain = adaptConnectionCredentialsProvider(mockConnectionCredentialsProvider)
            const provider = chain.providers[0] as () => AWS.Credentials
            const credentials = provider()
            assert.ok(credentials instanceof AWS.Credentials)
        })

        it('should set needsRefresh to always return true', function () {
            const chain = adaptConnectionCredentialsProvider(mockConnectionCredentialsProvider)
            const provider = chain.providers[0] as () => AWS.Credentials
            const credentials = provider()
            assert.strictEqual(credentials.needsRefresh(), true)
        })
    })
})
