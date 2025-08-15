/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { ConnectionCredentialsProvider } from '../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'
import { SmusAuthenticationProvider } from '../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import { DataZoneClient } from '../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { ToolkitError } from '../../../shared/errors'

describe('ConnectionCredentialsProvider', function () {
    let mockAuthProvider: sinon.SinonStubbedInstance<SmusAuthenticationProvider>
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let connectionProvider: ConnectionCredentialsProvider
    let dataZoneClientStub: sinon.SinonStub

    const testConnectionId = 'conn-123456'
    const testDomainId = 'dzd_testdomain'
    const testRegion = 'us-east-2'

    const mockConnectionCredentials = {
        accessKeyId: 'AKIA-CONNECTION-KEY',
        secretAccessKey: 'connection-secret-key',
        sessionToken: 'connection-session-token',
        expiration: new Date(Date.now() + 3600000), // 1 hour from now
    }

    const mockGetConnectionResponse = {
        connectionId: testConnectionId,
        name: 'Test Connection',
        type: 'S3',
        domainId: testDomainId,
        projectId: 'project-123',
        connectionCredentials: mockConnectionCredentials,
    }

    beforeEach(function () {
        // Mock auth provider
        mockAuthProvider = {
            isConnected: sinon.stub().returns(true),
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns(testRegion),
            activeConnection: {
                ssoRegion: testRegion,
            },
        } as any

        // Mock DataZone client
        mockDataZoneClient = {
            getConnection: sinon.stub().resolves(mockGetConnectionResponse),
        } as any

        // Stub DataZoneClient.getInstance
        dataZoneClientStub = sinon.stub(DataZoneClient, 'getInstance').resolves(mockDataZoneClient as any)

        connectionProvider = new ConnectionCredentialsProvider(mockAuthProvider as any, testConnectionId)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('should create provider with correct properties', function () {
            assert.strictEqual(connectionProvider.getConnectionId(), testConnectionId)
            assert.strictEqual(connectionProvider.getDefaultRegion(), testRegion)
        })
    })

    describe('getCredentialsId', function () {
        it('should return correct credentials ID', function () {
            const credentialsId = connectionProvider.getCredentialsId()
            assert.strictEqual(credentialsId.credentialSource, 'temp')
            assert.strictEqual(credentialsId.credentialTypeId, `${testDomainId}:${testConnectionId}`)
        })
    })

    describe('getHashCode', function () {
        it('should return correct hash code', function () {
            const hashCode = connectionProvider.getHashCode()
            assert.strictEqual(hashCode, `smus-connection:${testDomainId}:${testConnectionId}`)
        })
    })

    describe('isAvailable', function () {
        it('should return true when auth provider is connected', async function () {
            mockAuthProvider.isConnected.returns(true)
            const isAvailable = await connectionProvider.isAvailable()
            assert.strictEqual(isAvailable, true)
        })

        it('should return false when auth provider is not connected', async function () {
            mockAuthProvider.isConnected.returns(false)
            const isAvailable = await connectionProvider.isAvailable()
            assert.strictEqual(isAvailable, false)
        })

        it('should return false when auth provider throws error', async function () {
            mockAuthProvider.isConnected.throws(new Error('Connection error'))
            const isAvailable = await connectionProvider.isAvailable()
            assert.strictEqual(isAvailable, false)
        })
    })

    describe('canAutoConnect', function () {
        it('should return false', async function () {
            const canAutoConnect = await connectionProvider.canAutoConnect()
            assert.strictEqual(canAutoConnect, false)
        })
    })

    describe('getCredentials', function () {
        it('should fetch and return connection credentials', async function () {
            const credentials = await connectionProvider.getCredentials()

            assert.strictEqual(credentials.accessKeyId, mockConnectionCredentials.accessKeyId)
            assert.strictEqual(credentials.secretAccessKey, mockConnectionCredentials.secretAccessKey)
            assert.strictEqual(credentials.sessionToken, mockConnectionCredentials.sessionToken)
            assert(credentials.expiration instanceof Date)

            // Verify DataZone client was called correctly
            sinon.assert.calledOnce(dataZoneClientStub)
            sinon.assert.calledWith(mockDataZoneClient.getConnection, {
                domainIdentifier: testDomainId,
                identifier: testConnectionId,
                withSecret: true,
            })
        })

        it('should use cached credentials on subsequent calls', async function () {
            // First call
            const credentials1 = await connectionProvider.getCredentials()
            // Second call
            const credentials2 = await connectionProvider.getCredentials()

            assert.strictEqual(credentials1, credentials2)
            // DataZone client should only be called once due to caching
            sinon.assert.calledOnce(mockDataZoneClient.getConnection)
        })

        it('should throw error when no connection credentials available', async function () {
            mockDataZoneClient.getConnection.resolves({
                ...mockGetConnectionResponse,
                connectionCredentials: undefined,
            })

            await assert.rejects(
                () => connectionProvider.getCredentials(),
                (err: ToolkitError) => {
                    assert.strictEqual(err.code, 'NoConnectionCredentials')
                    return true
                }
            )
        })

        it('should throw error when connection credentials are invalid', async function () {
            mockDataZoneClient.getConnection.resolves({
                ...mockGetConnectionResponse,
                connectionCredentials: {
                    accessKeyId: '', // Invalid empty string
                    secretAccessKey: 'valid-secret',
                    sessionToken: 'valid-token',
                },
            })

            await assert.rejects(
                () => connectionProvider.getCredentials(),
                (err: ToolkitError) => {
                    assert.strictEqual(err.code, 'InvalidConnectionCredentials')
                    return true
                }
            )
        })

        it('should throw error when DataZone client fails', async function () {
            const dataZoneError = new Error('DataZone API error')
            mockDataZoneClient.getConnection.rejects(dataZoneError)

            await assert.rejects(
                () => connectionProvider.getCredentials(),
                (err: ToolkitError) => {
                    assert.strictEqual(err.code, 'ConnectionCredentialsFetchFailed')
                    return true
                }
            )
        })
    })

    describe('invalidate', function () {
        it('should clear cached credentials', async function () {
            // Get credentials to populate cache
            await connectionProvider.getCredentials()
            sinon.assert.calledOnce(mockDataZoneClient.getConnection)

            // Invalidate cache
            connectionProvider.invalidate()

            // Get credentials again - should make new API call
            await connectionProvider.getCredentials()
            sinon.assert.calledTwice(mockDataZoneClient.getConnection)
        })
    })

    describe('provider metadata', function () {
        it('should return correct provider type', function () {
            assert.strictEqual(connectionProvider.getProviderType(), 'temp')
        })

        it('should return correct telemetry type', function () {
            assert.strictEqual(connectionProvider.getTelemetryType(), 'other')
        })
    })
})
