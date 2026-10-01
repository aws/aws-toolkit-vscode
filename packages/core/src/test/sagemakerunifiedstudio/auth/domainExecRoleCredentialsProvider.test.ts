/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { DomainExecRoleCredentialsProvider } from '../../../sagemakerunifiedstudio/auth/providers/domainExecRoleCredentialsProvider'
import { ToolkitError } from '../../../shared/errors'
import fetch from 'node-fetch'
import { SmusTimeouts } from '../../../sagemakerunifiedstudio/shared/smusUtils'

describe('DomainExecRoleCredentialsProvider', function () {
    let derProvider: DomainExecRoleCredentialsProvider
    let mockGetAccessToken: sinon.SinonStub
    let fetchStub: sinon.SinonStub

    const testDomainId = 'dzd_testdomain'
    const testDomainUrl = 'https://test-domain.sagemaker.us-east-2.on.aws'
    const testSsoRegion = 'us-east-2'
    const testAccessToken = 'test-access-token-12345'

    const mockCredentialsResponse = {
        credentials: {
            accessKeyId: 'AKIA-DER-KEY',
            secretAccessKey: 'der-secret-key',
            sessionToken: 'der-session-token',
        },
    }

    beforeEach(function () {
        // Mock access token function
        mockGetAccessToken = sinon.stub().resolves(testAccessToken)

        // Mock fetch
        fetchStub = sinon.stub(fetch, 'default' as any).resolves({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: sinon.stub().resolves(JSON.stringify(mockCredentialsResponse)),
            json: sinon.stub().resolves(mockCredentialsResponse),
        } as any)

        derProvider = new DomainExecRoleCredentialsProvider(
            testDomainUrl,
            testDomainId,
            testSsoRegion,
            mockGetAccessToken
        )
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('should initialize with correct properties', function () {
            assert.strictEqual(derProvider.getDomainId(), testDomainId)
            assert.strictEqual(derProvider.getDomainUrl(), testDomainUrl)
            assert.strictEqual(derProvider.getDefaultRegion(), testSsoRegion)
        })
    })

    describe('getCredentialsId', function () {
        it('should return correct credentials ID', function () {
            const credentialsId = derProvider.getCredentialsId()
            assert.strictEqual(credentialsId.credentialSource, 'sso')
            assert.strictEqual(credentialsId.credentialTypeId, testDomainId)
        })
    })

    describe('getProviderType', function () {
        it('should return sso provider type', function () {
            assert.strictEqual(derProvider.getProviderType(), 'sso')
        })
    })

    describe('getTelemetryType', function () {
        it('should return ssoProfile telemetry type', function () {
            assert.strictEqual(derProvider.getTelemetryType(), 'ssoProfile')
        })
    })

    describe('getHashCode', function () {
        it('should return correct hash code', function () {
            const hashCode = derProvider.getHashCode()
            assert.strictEqual(hashCode, `smus-der:${testDomainId}:${testSsoRegion}`)
        })
    })

    describe('canAutoConnect', function () {
        it('should return false', async function () {
            const result = await derProvider.canAutoConnect()
            assert.strictEqual(result, false)
        })
    })

    describe('isAvailable', function () {
        it('should return true when access token is available', async function () {
            const result = await derProvider.isAvailable()
            assert.strictEqual(result, true)
            assert.ok(mockGetAccessToken.called)
        })

        it('should return false when access token throws error', async function () {
            mockGetAccessToken.rejects(new Error('Token error'))
            const result = await derProvider.isAvailable()
            assert.strictEqual(result, false)
        })
    })

    describe('getCredentials', function () {
        it('should fetch and cache DER credentials', async function () {
            const credentials = await derProvider.getCredentials()

            // Verify access token was fetched
            assert.ok(mockGetAccessToken.called)

            // Verify fetch was called with correct parameters
            assert.ok(fetchStub.called)
            const fetchCall = fetchStub.firstCall
            assert.strictEqual(fetchCall.args[0], `${testDomainUrl}/sso/redeem-token`)

            const fetchOptions = fetchCall.args[1]
            assert.strictEqual(fetchOptions.method, 'POST')
            assert.strictEqual(fetchOptions.headers['Content-Type'], 'application/json')
            assert.strictEqual(fetchOptions.headers['Accept'], 'application/json')
            assert.strictEqual(fetchOptions.headers['User-Agent'], 'aws-toolkit-vscode')

            const requestBody = JSON.parse(fetchOptions.body)
            assert.strictEqual(requestBody.domainId, testDomainId)
            assert.strictEqual(requestBody.accessToken, testAccessToken)

            // Verify timeout is set
            assert.strictEqual(fetchOptions.timeout, SmusTimeouts.apiCallTimeoutMs)
            assert.strictEqual(fetchOptions.timeout, 10000) // 10 seconds

            // Verify returned credentials
            assert.strictEqual(credentials.accessKeyId, mockCredentialsResponse.credentials.accessKeyId)
            assert.strictEqual(credentials.secretAccessKey, mockCredentialsResponse.credentials.secretAccessKey)
            assert.strictEqual(credentials.sessionToken, mockCredentialsResponse.credentials.sessionToken)
            assert.ok(credentials.expiration)
        })

        it('should use cached credentials when available', async function () {
            // First call should fetch credentials
            const credentials1 = await derProvider.getCredentials()

            // Second call should use cache
            const credentials2 = await derProvider.getCredentials()

            // Fetch should only be called once
            assert.strictEqual(fetchStub.callCount, 1)
            assert.strictEqual(mockGetAccessToken.callCount, 1)

            // Credentials should be the same
            assert.strictEqual(credentials1, credentials2)
        })

        it('should handle missing access token', async function () {
            mockGetAccessToken.resolves('')

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'DerCredentialsFetchFailed' && err.message.includes('No access token available')
                }
            )
        })

        it('should handle HTTP errors from redeem token API', async function () {
            fetchStub.resolves({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: sinon.stub().resolves('Invalid token'),
            } as any)

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'DerCredentialsFetchFailed' && err.message.includes('401')
                }
            )
        })

        it('should handle timeout errors', async function () {
            const timeoutError = new Error('Request timeout')
            timeoutError.name = 'AbortError'
            fetchStub.rejects(timeoutError)

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return (
                        err.code === 'DerCredentialsFetchFailed' && err.message.includes('timed out after 10 seconds')
                    )
                }
            )
        })

        it('should handle network errors', async function () {
            const networkError = new Error('Network error')
            fetchStub.rejects(networkError)

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'DerCredentialsFetchFailed'
                }
            )
        })

        it('should handle missing credentials object in response', async function () {
            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify({})),
                json: sinon.stub().resolves({}), // Missing credentials object
            } as any)

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return (
                        err.code === 'DerCredentialsFetchFailed' && err.message.includes('Missing credentials object')
                    )
                }
            )
        })

        it('should handle invalid accessKeyId in response', async function () {
            const invalidResponse = {
                credentials: {
                    accessKeyId: '', // Invalid empty string
                    secretAccessKey: 'valid-secret',
                    sessionToken: 'valid-token',
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(invalidResponse)),
                json: sinon.stub().resolves(invalidResponse),
            } as any)

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'DerCredentialsFetchFailed' && err.message.includes('Invalid accessKeyId')
                }
            )
        })

        it('should handle invalid secretAccessKey in response', async function () {
            const invalidResponse = {
                credentials: {
                    accessKeyId: 'valid-key',
                    secretAccessKey: undefined, // Invalid null value
                    sessionToken: 'valid-token',
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(invalidResponse)),
                json: sinon.stub().resolves(invalidResponse),
            } as any)

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'DerCredentialsFetchFailed' && err.message.includes('Invalid secretAccessKey')
                }
            )
        })

        it('should handle invalid sessionToken in response', async function () {
            const invalidResponse = {
                credentials: {
                    accessKeyId: 'valid-key',
                    secretAccessKey: 'valid-secret',
                    sessionToken: undefined, // Invalid undefined value
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(invalidResponse)),
                json: sinon.stub().resolves(invalidResponse),
            } as any)

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'DerCredentialsFetchFailed' && err.message.includes('Invalid sessionToken')
                }
            )
        })

        it('should set default expiration when not provided in response', async function () {
            const credentials = await derProvider.getCredentials()

            // Should have expiration set to 10 mins from now
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = Date.now() + 10 * 60 * 1000 // 10 minutes
            const timeDiff = Math.abs(expirationTime - expectedTime)
            assert.ok(timeDiff < 5000, 'Expiration should be 10 mins from now')
        })

        it('should use expiration from API response when provided as ISO string', async function () {
            const futureExpiration = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
            const responseWithExpiration = {
                credentials: {
                    accessKeyId: 'AKIA-DER-KEY',
                    secretAccessKey: 'der-secret-key',
                    sessionToken: 'der-session-token',
                    expiration: futureExpiration.toISOString(), // API returns expiration as ISO string
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(responseWithExpiration)),
                json: sinon.stub().resolves(responseWithExpiration),
            } as any)

            const credentials = await derProvider.getCredentials()

            // Should use the expiration from the API response
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = futureExpiration.getTime()
            const timeDiff = Math.abs(expirationTime - expectedTime)
            assert.ok(timeDiff < 1000, 'Should use expiration from API response')
        })

        it('should handle epoch timestamp in seconds from API response', async function () {
            const futureTime = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now in seconds
            const responseWithEpochExpiration = {
                credentials: {
                    accessKeyId: 'AKIA-DER-KEY',
                    secretAccessKey: 'der-secret-key',
                    sessionToken: 'der-session-token',
                    expiration: futureTime.toString(), // Epoch timestamp in seconds as string
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(responseWithEpochExpiration)),
                json: sinon.stub().resolves(responseWithEpochExpiration),
            } as any)

            const credentials = await derProvider.getCredentials()

            // Should correctly parse epoch timestamp and convert to Date
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = futureTime * 1000 // Convert to milliseconds
            const timeDiff = Math.abs(expirationTime - expectedTime)
            assert.ok(timeDiff < 1000, 'Should correctly parse epoch timestamp in seconds')
        })

        it('should handle epoch timestamp as number from API response', async function () {
            const futureTime = Math.floor(Date.now() / 1000) + 7200 // 2 hours from now in seconds
            const responseWithEpochExpiration = {
                credentials: {
                    accessKeyId: 'AKIA-DER-KEY',
                    secretAccessKey: 'der-secret-key',
                    sessionToken: 'der-session-token',
                    expiration: futureTime, // Epoch timestamp in seconds as number
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(responseWithEpochExpiration)),
                json: sinon.stub().resolves(responseWithEpochExpiration),
            } as any)

            const credentials = await derProvider.getCredentials()

            // Should correctly parse epoch timestamp and convert to Date
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = futureTime * 1000 // Convert to milliseconds
            const timeDiff = Math.abs(expirationTime - expectedTime)
            assert.ok(timeDiff < 1000, 'Should correctly parse epoch timestamp as number')
        })

        it('should handle zero epoch timestamp gracefully', async function () {
            const responseWithZeroExpiration = {
                credentials: {
                    accessKeyId: 'AKIA-DER-KEY',
                    secretAccessKey: 'der-secret-key',
                    sessionToken: 'der-session-token',
                    expiration: '0', // Zero is not > 0, so treated as ISO string "0" which represents year 0
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(responseWithZeroExpiration)),
                json: sinon.stub().resolves(responseWithZeroExpiration),
            } as any)

            const credentials = await derProvider.getCredentials()

            // "0" is parsed as a valid date (year 0), not as an invalid date
            // So it should use the parsed date, not the default expiration
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = new Date('0').getTime() // Year 0
            assert.strictEqual(expirationTime, expectedTime, 'Should use parsed date for year 0')
        })

        it('should handle negative epoch timestamp gracefully', async function () {
            const responseWithNegativeExpiration = {
                credentials: {
                    accessKeyId: 'AKIA-DER-KEY',
                    secretAccessKey: 'der-secret-key',
                    sessionToken: 'der-session-token',
                    expiration: '-1', // Negative is not > 0, so treated as ISO string "-1" which represents year -1
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(responseWithNegativeExpiration)),
                json: sinon.stub().resolves(responseWithNegativeExpiration),
            } as any)

            const credentials = await derProvider.getCredentials()

            // "-1" is parsed as a valid date (year -1), not as an invalid date
            // So it should use the parsed date, not the default expiration
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = new Date('-1').getTime() // Year -1
            assert.strictEqual(expirationTime, expectedTime, 'Should use parsed date for year -1')
        })

        it('should handle JSON parsing errors', async function () {
            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves('invalid json'),
                json: sinon.stub().rejects(new Error('Invalid JSON')),
            } as any)

            await assert.rejects(
                () => derProvider.getCredentials(),
                (err: ToolkitError) => {
                    return err.code === 'DerCredentialsFetchFailed'
                }
            )
        })

        it('should handle invalid expiration string in response', async function () {
            const responseWithInvalidExpiration = {
                credentials: {
                    accessKeyId: 'AKIA-DER-KEY',
                    secretAccessKey: 'der-secret-key',
                    sessionToken: 'der-session-token',
                    expiration: 'invalid-date-string', // Invalid date string
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(responseWithInvalidExpiration)),
                json: sinon.stub().resolves(responseWithInvalidExpiration),
            } as any)

            const credentials = await derProvider.getCredentials()

            // Should fall back to default expiration when date parsing fails
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()

            // Should be a valid timestamp (not NaN) using the default expiration
            assert.ok(!isNaN(expirationTime), 'Should have valid expiration timestamp')

            // Should be close to now + 10 minutes (default expiration)
            const expectedTime = Date.now() + 10 * 60 * 1000
            const timeDiff = Math.abs(expirationTime - expectedTime)
            assert.ok(timeDiff < 5000, 'Should fall back to default expiration for invalid date string')
        })

        it('should handle empty expiration string in response', async function () {
            const responseWithEmptyExpiration = {
                credentials: {
                    accessKeyId: 'AKIA-DER-KEY',
                    secretAccessKey: 'der-secret-key',
                    sessionToken: 'der-session-token',
                    expiration: '', // Empty string
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(responseWithEmptyExpiration)),
                json: sinon.stub().resolves(responseWithEmptyExpiration),
            } as any)

            const credentials = await derProvider.getCredentials()

            // Should fall back to default expiration for empty string
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = Date.now() + 10 * 60 * 1000 // Default 10 minutes
            const timeDiff = Math.abs(expirationTime - expectedTime)
            assert.ok(timeDiff < 5000, 'Should use default expiration for empty string')
        })

        it('should handle non-numeric string that looks like a number', async function () {
            const responseWithInvalidNumber = {
                credentials: {
                    accessKeyId: 'AKIA-DER-KEY',
                    secretAccessKey: 'der-secret-key',
                    sessionToken: 'der-session-token',
                    expiration: '123abc', // Non-numeric string
                },
            }

            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: sinon.stub().resolves(JSON.stringify(responseWithInvalidNumber)),
                json: sinon.stub().resolves(responseWithInvalidNumber),
            } as any)

            const credentials = await derProvider.getCredentials()

            // Should fall back to default expiration for invalid numeric string
            assert.ok(credentials.expiration)
            const expirationTime = credentials.expiration!.getTime()
            const expectedTime = Date.now() + 10 * 60 * 1000 // Default 10 minutes
            const timeDiff = Math.abs(expirationTime - expectedTime)
            assert.ok(timeDiff < 5000, 'Should use default expiration for invalid numeric string')
        })
    })

    describe('invalidate', function () {
        it('should clear cache and force fresh fetch on next call', async function () {
            // First call to populate cache
            await derProvider.getCredentials()
            assert.strictEqual(fetchStub.callCount, 1)

            // Invalidate should clear cache
            derProvider.invalidate()

            // Next call should fetch fresh credentials
            await derProvider.getCredentials()
            assert.strictEqual(fetchStub.callCount, 2)
        })
    })
})
