/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as jose from 'jose'
import { AwsCredentialsService, encryptionKey } from '../../../../awsService/cloudformation/auth/credentials'

describe('AwsCredentialsService', function () {
    let sandbox: sinon.SinonSandbox
    let mockStacksManager: any
    let mockResourcesManager: any
    let mockRegionManager: any
    let mockClient: any
    let credentialsService: AwsCredentialsService

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockStacksManager = { reload: sandbox.stub(), hasMore: sandbox.stub().returns(false) }
        mockResourcesManager = { reload: sandbox.stub() }
        mockClient = { sendRequest: sandbox.stub() }

        const mockRegionManager = { getSelectedRegion: () => 'us-east-1' } as any

        credentialsService = new AwsCredentialsService(mockStacksManager, mockResourcesManager, mockRegionManager)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('constructor', function () {
        it('should initialize credentials service', function () {
            credentialsService = new AwsCredentialsService(mockStacksManager, mockResourcesManager, mockRegionManager)
            assert(credentialsService !== undefined)
        })
    })

    describe('createEncryptedCredentialsRequest', function () {
        beforeEach(function () {
            credentialsService = new AwsCredentialsService(mockStacksManager, mockResourcesManager, mockRegionManager)
        })

        it('should create encrypted request with correct structure', async function () {
            const mockCredentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
                sessionToken: 'test-token',
                expiration: new Date(),
            }

            const result = await (credentialsService as any).createEncryptedCredentialsRequest(mockCredentials)

            assert.strictEqual(typeof result.data, 'string')
            assert.strictEqual(result.encrypted, true)
        })

        it('should encrypt credentials that can be decrypted', async function () {
            const mockCredentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
                sessionToken: 'test-token',
                expiration: new Date(),
            }

            const encryptedRequest = await (credentialsService as any).createEncryptedCredentialsRequest(
                mockCredentials
            )

            // Verify we can decrypt it back
            const decrypted = await jose.compactDecrypt(encryptedRequest.data, encryptionKey)
            const decryptedData = JSON.parse(new TextDecoder().decode(decrypted.plaintext))

            // Compare with expected serialized format (Date becomes string in JSON)
            const expectedCredentials = {
                ...mockCredentials,
                expiration: mockCredentials.expiration.toISOString(),
            }
            assert.deepStrictEqual(decryptedData.data, expectedCredentials)
        })
    })

    describe('initialize', function () {
        it('should accept language client', async function () {
            credentialsService = new AwsCredentialsService(mockStacksManager, mockResourcesManager, mockRegionManager)
            await credentialsService.initialize(mockClient)
            // Test passes if no error thrown
            assert(true)
        })
    })
})
