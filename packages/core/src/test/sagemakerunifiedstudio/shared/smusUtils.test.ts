/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    SmusUtils,
    SmusErrorCodes,
    SmusTimeouts,
    SmusCredentialExpiry,
    validateCredentialFields,
} from '../../../sagemakerunifiedstudio/shared/smusUtils'
import { ToolkitError } from '../../../shared/errors'
import fetch from 'node-fetch'

describe('SmusUtils', () => {
    const testDomainUrl = 'https://dzd_domainId.sagemaker.us-east-2.on.aws'
    const testDomainIdLowercase = 'dzd_domainid' // Domain IDs get lowercased by URL parsing
    const testRegion = 'us-east-2'

    afterEach(() => {
        sinon.restore()
    })

    describe('extractDomainIdFromUrl', () => {
        it('should extract domain ID from valid URL', () => {
            const result = SmusUtils.extractDomainIdFromUrl(testDomainUrl)
            assert.strictEqual(result, testDomainIdLowercase)
        })

        it('should return undefined for invalid URL', () => {
            const result = SmusUtils.extractDomainIdFromUrl('invalid-url')
            assert.strictEqual(result, undefined)
        })

        it('should handle URLs with dzd- prefix', () => {
            const urlWithDash = 'https://dzd-domainId.sagemaker.us-east-2.on.aws'
            const result = SmusUtils.extractDomainIdFromUrl(urlWithDash)
            assert.strictEqual(result, 'dzd-domainid')
        })

        it('should handle URLs with dzd_ prefix', () => {
            const urlWithUnderscore = 'https://dzd_domainId.sagemaker.us-east-2.on.aws'
            const result = SmusUtils.extractDomainIdFromUrl(urlWithUnderscore)
            assert.strictEqual(result, testDomainIdLowercase)
        })
    })

    describe('extractRegionFromUrl', () => {
        it('should extract region from valid URL', () => {
            const result = SmusUtils.extractRegionFromUrl(testDomainUrl)
            assert.strictEqual(result, testRegion)
        })

        it('should return fallback region for invalid URL', () => {
            const result = SmusUtils.extractRegionFromUrl('invalid-url', 'us-west-2')
            assert.strictEqual(result, 'us-west-2')
        })

        it('should return default fallback region when not specified', () => {
            const result = SmusUtils.extractRegionFromUrl('invalid-url')
            assert.strictEqual(result, 'us-east-1')
        })

        it('should handle different regions', () => {
            const urlWithDifferentRegion = 'https://dzd_test.sagemaker.eu-west-1.on.aws'
            const result = SmusUtils.extractRegionFromUrl(urlWithDifferentRegion)
            assert.strictEqual(result, 'eu-west-1')
        })

        it('should handle non-prod stages', () => {
            const urlWithStage = 'https://dzd_test.sagemaker-gamma.us-west-2.on.aws'
            const result = SmusUtils.extractRegionFromUrl(urlWithStage)
            assert.strictEqual(result, 'us-west-2')
        })
    })

    describe('extractDomainInfoFromUrl', () => {
        it('should extract both domain ID and region', () => {
            const result = SmusUtils.extractDomainInfoFromUrl(testDomainUrl)
            assert.strictEqual(result.domainId, testDomainIdLowercase)
            assert.strictEqual(result.region, testRegion)
        })

        it('should use fallback region when extraction fails', () => {
            const result = SmusUtils.extractDomainInfoFromUrl('invalid-url', 'us-west-2')
            assert.strictEqual(result.domainId, undefined)
            assert.strictEqual(result.region, 'us-west-2')
        })
    })

    describe('validateDomainUrl', () => {
        it('should return undefined for valid URL', () => {
            const result = SmusUtils.validateDomainUrl(testDomainUrl)
            assert.strictEqual(result, undefined)
        })

        it('should return error for empty URL', () => {
            const result = SmusUtils.validateDomainUrl('')
            assert.strictEqual(result, 'Domain URL is required')
        })

        it('should return error for whitespace-only URL', () => {
            const result = SmusUtils.validateDomainUrl('   ')
            assert.strictEqual(result, 'Domain URL is required')
        })

        it('should return error for non-HTTPS URL', () => {
            const result = SmusUtils.validateDomainUrl('http://dzd_test.sagemaker.us-east-1.on.aws')
            assert.strictEqual(result, 'Domain URL must use HTTPS (https://)')
        })

        it('should return error for non-SageMaker domain', () => {
            const result = SmusUtils.validateDomainUrl('https://example.com')
            assert.strictEqual(
                result,
                'URL must be a valid SageMaker Unified Studio domain (e.g., https://dzd_xxxxxxxxx.sagemaker.us-east-1.on.aws)'
            )
        })

        it('should return error for URL without domain ID', () => {
            const result = SmusUtils.validateDomainUrl('https://invalid.sagemaker.us-east-1.on.aws')
            assert.strictEqual(result, 'URL must contain a valid domain ID (starting with dzd- or dzd_)')
        })

        it('should return error for invalid URL format', () => {
            const result = SmusUtils.validateDomainUrl('not-a-url')
            assert.strictEqual(result, 'Domain URL must use HTTPS (https://)')
        })

        it('should handle URLs with dzd- prefix', () => {
            const urlWithDash = 'https://dzd-domainId.sagemaker.us-east-2.on.aws'
            const result = SmusUtils.validateDomainUrl(urlWithDash)
            assert.strictEqual(result, undefined)
        })

        it('should handle URLs with dzd_ prefix', () => {
            const urlWithUnderscore = 'https://dzd_domainId.sagemaker.us-east-2.on.aws'
            const result = SmusUtils.validateDomainUrl(urlWithUnderscore)
            assert.strictEqual(result, undefined)
        })

        it('should trim whitespace from URL', () => {
            const urlWithWhitespace = '  https://dzd_domainId.sagemaker.us-east-2.on.aws  '
            const result = SmusUtils.validateDomainUrl(urlWithWhitespace)
            assert.strictEqual(result, undefined)
        })
    })

    describe('constants', () => {
        it('should export SmusErrorCodes with correct values', () => {
            assert.strictEqual(SmusErrorCodes.NoActiveConnection, 'NoActiveConnection')
            assert.strictEqual(SmusErrorCodes.ApiTimeout, 'ApiTimeout')
            assert.strictEqual(SmusErrorCodes.SmusLoginFailed, 'SmusLoginFailed')
            assert.strictEqual(SmusErrorCodes.RedeemAccessTokenFailed, 'RedeemAccessTokenFailed')
        })

        it('should export SmusTimeouts with correct values', () => {
            assert.strictEqual(SmusTimeouts.apiCallTimeoutMs, 10 * 1000)
        })

        it('should export SmusCredentialExpiry with correct values', () => {
            assert.strictEqual(SmusCredentialExpiry.derExpiryMs, 55 * 60 * 1000)
            assert.strictEqual(SmusCredentialExpiry.projectExpiryMs, 10 * 60 * 1000)
            assert.strictEqual(SmusCredentialExpiry.connectionExpiryMs, 10 * 60 * 1000)
        })
    })

    describe('getSsoInstanceInfo', () => {
        let fetchStub: sinon.SinonStub

        beforeEach(() => {
            fetchStub = sinon.stub(fetch, 'default' as any)
        })

        afterEach(() => {
            fetchStub.restore()
        })

        it('should throw error for invalid domain URL', async () => {
            await assert.rejects(
                () => SmusUtils.getSsoInstanceInfo('invalid-url'),
                (error: any) => {
                    assert.strictEqual(error.code, 'InvalidDomainUrl')
                    return true
                }
            )
        })

        it('should throw error for URL without domain ID', async () => {
            await assert.rejects(
                () => SmusUtils.getSsoInstanceInfo('https://invalid.sagemaker.us-east-1.on.aws'),
                (error: any) => {
                    assert.strictEqual(error.code, 'InvalidDomainUrl')
                    return true
                }
            )
        })

        it('should handle timeout errors', async () => {
            const timeoutError = new Error('Request timeout')
            timeoutError.name = 'AbortError'
            fetchStub.rejects(timeoutError)

            await assert.rejects(
                () => SmusUtils.getSsoInstanceInfo(testDomainUrl),
                (error: any) => {
                    assert.strictEqual(error.code, SmusErrorCodes.ApiTimeout)
                    assert.ok(error.message.includes('timed out after 10 seconds'))
                    return true
                }
            )
        })

        it('should handle login failure errors', async () => {
            fetchStub.resolves({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            })

            await assert.rejects(
                () => SmusUtils.getSsoInstanceInfo(testDomainUrl),
                (error: any) => {
                    assert.strictEqual(error.code, SmusErrorCodes.SmusLoginFailed)
                    assert.ok(error.message.includes('401'))
                    return true
                }
            )
        })

        it('should successfully extract SSO instance info', async () => {
            const mockResponse = {
                ok: true,
                json: sinon.stub().resolves({
                    redirectUrl:
                        'https://example.com/oauth/authorize?client_id=arn%3Aaws%3Asso%3A%3A123456789%3Aapplication%2Fssoins-123%2Fapl-456',
                }),
            }
            fetchStub.resolves(mockResponse)

            const result = await SmusUtils.getSsoInstanceInfo(testDomainUrl)

            assert.strictEqual(result.ssoInstanceId, 'ssoins-123')
            assert.strictEqual(result.issuerUrl, 'https://identitycenter.amazonaws.com/ssoins-123')
            assert.strictEqual(result.clientId, 'arn:aws:sso::123456789:application/ssoins-123/apl-456')
            assert.strictEqual(result.region, testRegion)
        })

        it('should throw error for missing redirect URL', async () => {
            const mockResponse = {
                ok: true,
                json: sinon.stub().resolves({}),
            }
            fetchStub.resolves(mockResponse)

            await assert.rejects(
                () => SmusUtils.getSsoInstanceInfo(testDomainUrl),
                (error: any) => {
                    assert.strictEqual(error.code, 'InvalidLoginResponse')
                    return true
                }
            )
        })

        it('should throw error for missing client_id in redirect URL', async () => {
            const mockResponse = {
                ok: true,
                json: sinon.stub().resolves({
                    redirectUrl: 'https://example.com/oauth/authorize',
                }),
            }
            fetchStub.resolves(mockResponse)

            await assert.rejects(
                () => SmusUtils.getSsoInstanceInfo(testDomainUrl),
                (error: any) => {
                    assert.strictEqual(error.code, 'InvalidRedirectUrl')
                    return true
                }
            )
        })

        it('should throw error for invalid ARN format', async () => {
            const mockResponse = {
                ok: true,
                json: sinon.stub().resolves({
                    redirectUrl: 'https://example.com/oauth/authorize?client_id=invalid-arn',
                }),
            }
            fetchStub.resolves(mockResponse)

            await assert.rejects(
                () => SmusUtils.getSsoInstanceInfo(testDomainUrl),
                (error: any) => {
                    assert.strictEqual(error.code, 'InvalidArnFormat')
                    return true
                }
            )
        })
    })

    describe('extractSSOIdFromUserId', () => {
        it('should extract SSO ID from valid user ID', () => {
            const result = SmusUtils.extractSSOIdFromUserId('user-12345678-abcd-efgh-ijkl-123456789012')
            assert.strictEqual(result, '12345678-abcd-efgh-ijkl-123456789012')
        })

        it('should throw error for invalid user ID format', () => {
            assert.throws(
                () => SmusUtils.extractSSOIdFromUserId('invalid-format'),
                /Invalid UserId format: invalid-format/
            )
        })

        it('should throw error for empty user ID', () => {
            assert.throws(() => SmusUtils.extractSSOIdFromUserId(''), /Invalid UserId format: /)
        })

        it('should throw error for user ID without prefix', () => {
            assert.throws(
                () => SmusUtils.extractSSOIdFromUserId('12345678-abcd-efgh-ijkl-123456789012'),
                /Invalid UserId format: 12345678-abcd-efgh-ijkl-123456789012/
            )
        })
    })

    describe('validateCredentialFields', () => {
        it('should not throw for valid credentials', () => {
            const validCredentials = {
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                sessionToken:
                    'AQoEXAMPLEH4aoAH0gNCAPyJxz4BlCFFxWNE1OPTgk5TthT+FvwqnKwRcOIfrRh3c/LTo6UDdyJwOOvEVPvLXCrrrUtdnniCEXAMPLE',
            }

            assert.doesNotThrow(() => {
                validateCredentialFields(validCredentials, 'TestError', 'test context')
            })
        })

        it('should throw for missing accessKeyId', () => {
            const invalidCredentials = {
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                sessionToken: 'token',
            }

            assert.throws(
                () => validateCredentialFields(invalidCredentials, 'TestError', 'test context'),
                (error: any) => {
                    assert.ok(error instanceof ToolkitError)
                    assert.strictEqual(error.code, 'TestError')
                    assert.ok(error.message.includes('Invalid accessKeyId in test context'))
                    return true
                }
            )
        })

        it('should throw for invalid accessKeyId type', () => {
            const invalidCredentials = {
                accessKeyId: 123,
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                sessionToken: 'token',
            }

            assert.throws(
                () => validateCredentialFields(invalidCredentials, 'TestError', 'test context'),
                (error: any) => {
                    assert.ok(error instanceof ToolkitError)
                    assert.strictEqual(error.code, 'TestError')
                    assert.ok(error.message.includes('Invalid accessKeyId in test context: number'))
                    return true
                }
            )
        })

        it('should throw for missing secretAccessKey', () => {
            const invalidCredentials = {
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                sessionToken: 'token',
            }

            assert.throws(
                () => validateCredentialFields(invalidCredentials, 'TestError', 'test context'),
                (error: any) => {
                    assert.ok(error instanceof ToolkitError)
                    assert.strictEqual(error.code, 'TestError')
                    assert.ok(error.message.includes('Invalid secretAccessKey in test context'))
                    return true
                }
            )
        })

        it('should throw for missing sessionToken', () => {
            const invalidCredentials = {
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            }

            assert.throws(
                () => validateCredentialFields(invalidCredentials, 'TestError', 'test context'),
                (error: any) => {
                    assert.ok(error instanceof ToolkitError)
                    assert.strictEqual(error.code, 'TestError')
                    assert.ok(error.message.includes('Invalid sessionToken in test context'))
                    return true
                }
            )
        })
    })
})
