/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    getRecentDomains,
    updateRecentDomains,
    removeDomainFromCache,
    formatTimestamp,
    DomainCacheEntry,
    domainCacheKey,
    maxCachedDomains,
} from '../../../../sagemakerunifiedstudio/auth/utils/domainCache'
import globals from '../../../../shared/extensionGlobals'
import { SmusUtils } from '../../../../sagemakerunifiedstudio/shared/smusUtils'

describe('Domain Cache', function () {
    let sandbox: sinon.SinonSandbox
    let globalStateStub: sinon.SinonStubbedInstance<typeof globals.globalState>

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        globalStateStub = {
            tryGet: sandbox.stub(),
            update: sandbox.stub().resolves(),
        } as any
        sandbox.stub(globals, 'globalState').value(globalStateStub)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('getRecentDomains', function () {
        it('should return empty array when no cache exists', function () {
            globalStateStub.tryGet.returns({ domains: [] })

            const result = getRecentDomains()

            assert.strictEqual(result.length, 0)
            assert.ok(globalStateStub.tryGet.calledWith(domainCacheKey))
        })

        it('should return cached domains', function () {
            const mockDomains: DomainCacheEntry[] = [
                {
                    domainUrl: 'https://dzd_abc123.sagemaker.us-east-1.on.aws',
                    domainId: 'dzd_abc123',
                    region: 'us-east-1',
                    domainName: 'Test Domain',
                    lastUsedTimestamp: new Date().toISOString(),
                },
            ]
            globalStateStub.tryGet.returns({ domains: mockDomains })

            const result = getRecentDomains()

            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0].domainId, 'dzd_abc123')
            assert.strictEqual(result[0].domainName, 'Test Domain')
        })
    })

    describe('updateRecentDomains', function () {
        beforeEach(function () {
            globalStateStub.tryGet.returns({ domains: [] })
            sandbox.stub(SmusUtils, 'extractDomainInfoFromUrl').returns({
                domainId: 'dzd_abc123',
                region: 'us-east-1',
            })
        })

        it('should add new domain to empty cache', async function () {
            const domainUrl = 'https://dzd_abc123.sagemaker.us-east-1.on.aws'

            await updateRecentDomains(domainUrl, 'Test Domain')

            assert.ok(globalStateStub.update.calledOnce)
            const updateCall = globalStateStub.update.getCall(0)
            assert.strictEqual(updateCall.args[0], domainCacheKey)

            const savedData = updateCall.args[1]
            assert.strictEqual(savedData.domains.length, 1)
            assert.strictEqual(savedData.domains[0].domainUrl, domainUrl)
            assert.strictEqual(savedData.domains[0].domainId, 'dzd_abc123')
            assert.strictEqual(savedData.domains[0].region, 'us-east-1')
            assert.strictEqual(savedData.domains[0].domainName, 'Test Domain')
            assert.ok(savedData.domains[0].lastUsedTimestamp)
        })

        it('should add domain without name', async function () {
            const domainUrl = 'https://dzd_abc123.sagemaker.us-east-1.on.aws'

            await updateRecentDomains(domainUrl)

            const updateCall = globalStateStub.update.getCall(0)
            const savedData = updateCall.args[1]
            assert.strictEqual(savedData.domains[0].domainName, undefined)
        })

        it('should move existing domain to front and update timestamp', async function () {
            const existingDomain: DomainCacheEntry = {
                domainUrl: 'https://dzd_abc123.sagemaker.us-east-1.on.aws',
                domainId: 'dzd_abc123',
                region: 'us-east-1',
                lastUsedTimestamp: '2024-01-01T00:00:00.000Z',
            }
            const otherDomain: DomainCacheEntry = {
                domainUrl: 'https://dzd_xyz789.sagemaker.us-west-2.on.aws',
                domainId: 'dzd_xyz789',
                region: 'us-west-2',
                lastUsedTimestamp: '2024-01-02T00:00:00.000Z',
            }
            globalStateStub.tryGet.returns({ domains: [otherDomain, existingDomain] })

            await updateRecentDomains(existingDomain.domainUrl, 'Updated Name')

            const updateCall = globalStateStub.update.getCall(0)
            const savedData = updateCall.args[1]
            assert.strictEqual(savedData.domains.length, 2)
            assert.strictEqual(savedData.domains[0].domainUrl, existingDomain.domainUrl)
            assert.strictEqual(savedData.domains[0].domainName, 'Updated Name')
            assert.notStrictEqual(savedData.domains[0].lastUsedTimestamp, existingDomain.lastUsedTimestamp)
            assert.strictEqual(savedData.domains[1].domainUrl, otherDomain.domainUrl)
        })

        it('should limit cache to maxCachedDomains entries', async function () {
            const existingDomains: DomainCacheEntry[] = []
            for (let i = 0; i < maxCachedDomains; i++) {
                existingDomains.push({
                    domainUrl: `https://dzd_test${i}.sagemaker.us-east-1.on.aws`,
                    domainId: `dzd_test${i}`,
                    region: 'us-east-1',
                    lastUsedTimestamp: new Date(Date.now() - i * 1000).toISOString(),
                })
            }
            globalStateStub.tryGet.returns({ domains: existingDomains })

            const newDomainUrl = 'https://dzd_new.sagemaker.us-east-1.on.aws'
            sandbox.restore()
            sandbox = sinon.createSandbox()
            sandbox.stub(globals, 'globalState').value(globalStateStub)
            sandbox.stub(SmusUtils, 'extractDomainInfoFromUrl').returns({
                domainId: 'dzd_new',
                region: 'us-east-1',
            })

            await updateRecentDomains(newDomainUrl)

            const updateCall = globalStateStub.update.getCall(0)
            const savedData = updateCall.args[1]
            assert.strictEqual(savedData.domains.length, maxCachedDomains)
            assert.strictEqual(savedData.domains[0].domainId, 'dzd_new')
            // The last domain should be the oldest one that wasn't evicted
            assert.strictEqual(
                savedData.domains[savedData.domains.length - 1].domainId,
                `dzd_test${maxCachedDomains - 2}` as string
            )
        })

        it('should handle invalid domain URL gracefully', async function () {
            sandbox.restore()
            sandbox = sinon.createSandbox()
            sandbox.stub(globals, 'globalState').value(globalStateStub)
            sandbox.stub(SmusUtils, 'extractDomainInfoFromUrl').returns({
                domainId: '',
                region: 'us-east-1',
            })

            await updateRecentDomains('invalid-url')

            assert.ok(globalStateStub.update.notCalled)
        })
    })

    describe('removeDomainFromCache', function () {
        it('should remove domain from cache', async function () {
            const domainToRemove: DomainCacheEntry = {
                domainUrl: 'https://dzd_abc123.sagemaker.us-east-1.on.aws',
                domainId: 'dzd_abc123',
                region: 'us-east-1',
                lastUsedTimestamp: new Date().toISOString(),
            }
            const domainToKeep: DomainCacheEntry = {
                domainUrl: 'https://dzd_xyz789.sagemaker.us-west-2.on.aws',
                domainId: 'dzd_xyz789',
                region: 'us-west-2',
                lastUsedTimestamp: new Date().toISOString(),
            }
            globalStateStub.tryGet.returns({ domains: [domainToRemove, domainToKeep] })

            await removeDomainFromCache(domainToRemove.domainUrl)

            const updateCall = globalStateStub.update.getCall(0)
            const savedData = updateCall.args[1]
            assert.strictEqual(savedData.domains.length, 1)
            assert.strictEqual(savedData.domains[0].domainUrl, domainToKeep.domainUrl)
        })
        it('should handle empty cache', async function () {
            globalStateStub.tryGet.returns({ domains: [] })

            await removeDomainFromCache('https://dzd_abc123.sagemaker.us-east-1.on.aws')

            const updateCall = globalStateStub.update.getCall(0)
            const savedData = updateCall.args[1]
            assert.strictEqual(savedData.domains.length, 0)
        })
    })

    describe('formatTimestamp', function () {
        it('should return "Just now" for very recent timestamps', function () {
            const now = new Date().toISOString()
            const result = formatTimestamp(now)
            assert.strictEqual(result, 'Just now')
        })

        it('should return minutes ago for timestamps within an hour', function () {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
            const result = formatTimestamp(fiveMinutesAgo)
            assert.strictEqual(result, '5 minutes ago')
        })

        it('should return singular minute for 1 minute ago', function () {
            const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
            const result = formatTimestamp(oneMinuteAgo)
            assert.strictEqual(result, '1 minute ago')
        })

        it('should return hours ago for timestamps within a day', function () {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
            const result = formatTimestamp(twoHoursAgo)
            assert.strictEqual(result, '2 hours ago')
        })

        it('should return singular hour for 1 hour ago', function () {
            const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
            const result = formatTimestamp(oneHourAgo)
            assert.strictEqual(result, '1 hour ago')
        })

        it('should return "Yesterday" for timestamps 1 day ago', function () {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const result = formatTimestamp(yesterday)
            assert.strictEqual(result, 'Yesterday')
        })

        it('should return days ago for timestamps within a week', function () {
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
            const result = formatTimestamp(threeDaysAgo)
            assert.strictEqual(result, '3 days ago')
        })

        it('should return localized date for timestamps older than a week', function () {
            const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
            const result = formatTimestamp(twoWeeksAgo)
            const expectedDate = new Date(twoWeeksAgo).toLocaleDateString()
            assert.strictEqual(result, expectedDate)
        })
    })
})
