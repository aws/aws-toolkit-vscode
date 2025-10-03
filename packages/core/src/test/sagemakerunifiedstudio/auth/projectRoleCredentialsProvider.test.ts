/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { ProjectRoleCredentialsProvider } from '../../../sagemakerunifiedstudio/auth/providers/projectRoleCredentialsProvider'
import { DataZoneClient } from '../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { ToolkitError } from '../../../shared/errors'

describe('ProjectRoleCredentialsProvider', function () {
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let mockSmusAuthProvider: any
    let projectProvider: ProjectRoleCredentialsProvider
    let dataZoneClientStub: sinon.SinonStub

    const testProjectId = 'test-project-123'
    const testDomainId = 'dzd_testdomain'
    const testRegion = 'us-east-2'

    const mockGetEnvironmentCredentialsResponse = {
        accessKeyId: 'AKIA-PROJECT-KEY',
        secretAccessKey: 'project-secret-key',
        sessionToken: 'project-session-token',
        expiration: new Date(Date.now() + 14 * 60 * 1000), // 14 minutes as Date object
        $metadata: {
            httpStatusCode: 200,
            requestId: 'test-request-id',
        },
    }

    beforeEach(function () {
        // Mock SMUS auth provider
        mockSmusAuthProvider = {
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns(testRegion),
            isConnected: sinon.stub().returns(true),
        } as any

        // Mock DataZone client
        mockDataZoneClient = {
            getProjectDefaultEnvironmentCreds: sinon.stub().resolves(mockGetEnvironmentCredentialsResponse),
        } as any

        // Stub DataZoneClient.getInstance
        dataZoneClientStub = sinon.stub(DataZoneClient, 'getInstance').resolves(mockDataZoneClient as any)

        projectProvider = new ProjectRoleCredentialsProvider(mockSmusAuthProvider, testProjectId)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('should initialize with DER provider and project ID', function () {
            assert.strictEqual(projectProvider.getProjectId(), testProjectId)
        })
    })

    describe('getCredentialsId', function () {
        it('should return correct credentials ID', function () {
            const credentialsId = projectProvider.getCredentialsId()
            assert.strictEqual(credentialsId.credentialSource, 'temp')
            assert.strictEqual(credentialsId.credentialTypeId, `${testDomainId}:${testProjectId}`)
        })
    })

    describe('getProviderType', function () {
        it('should return sso provider type', function () {
            assert.strictEqual(projectProvider.getProviderType(), 'temp')
        })
    })

    describe('getTelemetryType', function () {
        it('should return smusProfile telemetry type', function () {
            assert.strictEqual(projectProvider.getTelemetryType(), 'other')
        })
    })

    describe('getDefaultRegion', function () {
        it('should return DER provider default region', function () {
            assert.strictEqual(projectProvider.getDefaultRegion(), testRegion)
        })
    })

    describe('getHashCode', function () {
        it('should return correct hash code', function () {
            const hashCode = projectProvider.getHashCode()
            assert.strictEqual(hashCode, `smus-project:${testDomainId}:${testProjectId}`)
        })
    })

    describe('canAutoConnect', function () {
        it('should return false', async function () {
            const result = await projectProvider.canAutoConnect()
            assert.strictEqual(result, false)
        })
    })

    describe('isAvailable', function () {
        it('should delegate to SMUS auth provider', async function () {
            const result = await projectProvider.isAvailable()
            assert.strictEqual(result, true)
            assert.ok(mockSmusAuthProvider.isConnected.called)
        })
    })

    describe('getCredentials', function () {
        it('should fetch and cache project credentials', async function () {
            const credentials = await projectProvider.getCredentials()

            // Verify DataZone client getInstance was called
            assert.ok(dataZoneClientStub.calledWith(mockSmusAuthProvider))

            // Verify getProjectDefaultEnvironmentCreds was called
            assert.ok(mockDataZoneClient.getProjectDefaultEnvironmentCreds.called)
            assert.ok(mockDataZoneClient.getProjectDefaultEnvironmentCreds.calledWith(testProjectId))

            // Verify returned credentials
            assert.strictEqual(credentials.accessKeyId, mockGetEnvironmentCredentialsResponse.accessKeyId)
            assert.strictEqual(credentials.secretAccessKey, mockGetEnvironmentCredentialsResponse.secretAccessKey)
            assert.strictEqual(credentials.sessionToken, mockGetEnvironmentCredentialsResponse.sessionToken)
            assert.ok(credentials.expiration)
        })

        it('should use cached credentials when available', async function () {
            // First call should fetch credentials
            const credentials1 = await projectProvider.getCredentials()

            // Second call should use cache
            const credentials2 = await projectProvider.getCredentials()

            // DataZone client method should only be called once
            assert.strictEqual(mockDataZoneClient.getProjectDefaultEnvironmentCreds.callCount, 1)

            // Credentials should be the same
            assert.strictEqual(credentials1, credentials2)
        })

        it('should handle DataZone client errors', async function () {
            const error = new Error('DataZone client failed')
            mockDataZoneClient.getProjectDefaultEnvironmentCreds.rejects(error)

            await assert.rejects(
                () => projectProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'ProjectCredentialsFetchFailed' && err.message.includes(testProjectId)
                }
            )
        })

        it('should handle GetEnvironmentCredentials API errors', async function () {
            const error = new Error('API call failed')
            mockDataZoneClient.getProjectDefaultEnvironmentCreds.rejects(error)

            await assert.rejects(
                () => projectProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'ProjectCredentialsFetchFailed'
                }
            )
        })

        it('should handle missing credentials in response', async function () {
            mockDataZoneClient.getProjectDefaultEnvironmentCreds.resolves({
                accessKeyId: undefined,
                $metadata: {
                    httpStatusCode: 200,
                    requestId: 'test-request-id',
                },
            })

            await assert.rejects(
                () => projectProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'ProjectCredentialsFetchFailed'
                }
            )
        })

        it('should handle invalid credential fields', async function () {
            const invalidResponse = {
                accessKeyId: '', // Invalid empty string
                secretAccessKey: 'valid-secret',
                sessionToken: 'valid-token',
                $metadata: {
                    httpStatusCode: 200,
                    requestId: 'test-request-id',
                },
            }
            mockDataZoneClient.getProjectDefaultEnvironmentCreds.resolves(invalidResponse)

            await assert.rejects(
                () => projectProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'ProjectCredentialsFetchFailed'
                }
            )
        })

        it('should use default expiration when not provided in response', async function () {
            const responseWithoutExpiration = {
                accessKeyId: 'AKIA-PROJECT-KEY',
                secretAccessKey: 'project-secret-key',
                sessionToken: 'project-session-token',
                // No expiration field
                $metadata: {
                    httpStatusCode: 200,
                    requestId: 'test-request-id',
                },
            }
            mockDataZoneClient.getProjectDefaultEnvironmentCreds.resolves(responseWithoutExpiration)

            const credentials = await projectProvider.getCredentials()

            // Should have expiration set to ~10 minutes from now
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = Date.now() + 10 * 60 * 1000
            const timeDiff = Math.abs(expirationTime - expectedTime)
            assert.ok(timeDiff < 5000, 'Expiration should be ~10 minutes from now')
        })
    })

    describe('invalidate', function () {
        it('should clear cache and force fresh fetch on next call', async function () {
            // First call to populate cache
            await projectProvider.getCredentials()
            assert.strictEqual(mockDataZoneClient.getProjectDefaultEnvironmentCreds.callCount, 1)

            // Invalidate should clear cache
            projectProvider.invalidate()

            // Next call should fetch fresh credentials
            await projectProvider.getCredentials()
            assert.strictEqual(mockDataZoneClient.getProjectDefaultEnvironmentCreds.callCount, 2)
        })
    })
})
