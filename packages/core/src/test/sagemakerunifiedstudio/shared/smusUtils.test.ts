/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { SmusUtils, SmusErrorCodes, SmusTimeouts } from '../../../sagemakerunifiedstudio/shared/smusUtils'
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

        it('should use correct timeout in fetch call', async () => {
            const mockResponse = {
                ok: true,
                json: sinon.stub().resolves({
                    redirectUrl:
                        'https://example.com/oauth/authorize?client_id=arn%3Aaws%3Asso%3A%3A123456789%3Aapplication%2Fssoins-123%2Fapl-456',
                }),
            }
            fetchStub.resolves(mockResponse)

            await SmusUtils.getSsoInstanceInfo(testDomainUrl)

            assert.ok(fetchStub.called)
            const fetchOptions = fetchStub.firstCall.args[1]
            assert.strictEqual(fetchOptions.timeout, SmusTimeouts.apiCallTimeoutMs)
        })
    })
})
