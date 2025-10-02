/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    DataZoneDomainPreferencesClient,
    DataZoneDomain,
} from '../../../../sagemakerunifiedstudio/shared/client/datazoneDomainPreferencesClient'

describe('DataZoneDomainPreferencesClient', () => {
    let client: DataZoneDomainPreferencesClient
    let mockAuthProvider: any
    const testRegion = 'us-east-1'

    beforeEach(() => {
        // Create mock auth provider
        mockAuthProvider = {
            isConnected: sinon.stub().returns(true),
            onDidChangeActiveConnection: sinon.stub().returns({
                dispose: sinon.stub(),
            }),
        } as any

        // Clear instances and create new client
        DataZoneDomainPreferencesClient.dispose()
        client = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, testRegion)
    })

    afterEach(() => {
        sinon.restore()
        DataZoneDomainPreferencesClient.dispose()
    })

    describe('getInstance', () => {
        it('should return singleton instance for same region', () => {
            const instance1 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, testRegion)
            const instance2 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, testRegion)

            assert.strictEqual(instance1, instance2)
        })

        it('should create different instances for different regions', () => {
            const instance1 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, 'us-east-1')
            const instance2 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, 'us-west-2')

            assert.notStrictEqual(instance1, instance2)
        })

        it('should create new instance after dispose', () => {
            const instance1 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, testRegion)
            DataZoneDomainPreferencesClient.dispose()
            const instance2 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, testRegion)

            assert.notStrictEqual(instance1, instance2)
        })
    })

    describe('dispose', () => {
        it('should clear all instances', () => {
            const instance1 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, 'us-east-1')
            const instance2 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, 'us-west-2')

            DataZoneDomainPreferencesClient.dispose()

            // Should create new instance after dispose
            const newInstance1 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, 'us-east-1')
            const newInstance2 = DataZoneDomainPreferencesClient.getInstance(mockAuthProvider, 'us-west-2')

            assert.notStrictEqual(instance1, newInstance1)
            assert.notStrictEqual(instance2, newInstance2)
        })
    })

    describe('getRegion', () => {
        it('should return configured region', () => {
            const result = client.getRegion()
            assert.strictEqual(result, testRegion)
        })
    })

    describe('listDomains', () => {
        it('should list domains with pagination', async () => {
            const mockResponse = {
                items: [
                    {
                        id: 'dzd_domain1',
                        name: 'Test Domain 1',
                        description: 'First test domain',
                        arn: 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_domain1',
                        managedAccountId: '123456789012',
                        status: 'AVAILABLE',
                        portalUrl: 'https://domain1.datazone.aws',
                        createdAt: '2023-01-01T00:00:00Z',
                        lastUpdatedAt: '2023-01-02T00:00:00Z',
                        domainVersion: '1.0',
                        preferences: { DOMAIN_MODE: 'STANDARD' },
                    },
                ],
                nextToken: 'next-token',
            }

            const mockDataZoneClient = {
                listDomains: sinon.stub().returns({
                    promise: () => Promise.resolve(mockResponse),
                }),
            }

            sinon.stub(client as any, 'getDataZoneDomainPreferencesClient').resolves(mockDataZoneClient)

            const result = await client.listDomains({
                maxResults: 10,
                status: 'AVAILABLE',
            })

            assert.strictEqual(result.domains.length, 1)
            assert.strictEqual(result.domains[0].id, 'dzd_domain1')
            assert.strictEqual(result.domains[0].name, 'Test Domain 1')
            assert.strictEqual(result.domains[0].arn, 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_domain1')
            assert.strictEqual(result.domains[0].managedAccountId, '123456789012')
            assert.strictEqual(result.domains[0].status, 'AVAILABLE')
            assert.strictEqual(result.nextToken, 'next-token')
            assert.ok(result.domains[0].createdAt instanceof Date)
            assert.ok(result.domains[0].lastUpdatedAt instanceof Date)
        })

        it('should handle empty results', async () => {
            const mockResponse = {
                items: [],
                nextToken: undefined,
            }

            const mockDataZoneClient = {
                listDomains: sinon.stub().returns({
                    promise: () => Promise.resolve(mockResponse),
                }),
            }

            sinon.stub(client as any, 'getDataZoneDomainPreferencesClient').resolves(mockDataZoneClient)

            const result = await client.listDomains()

            assert.strictEqual(result.domains.length, 0)
            assert.strictEqual(result.nextToken, undefined)
        })

        it('should handle API errors', async () => {
            const error = new Error('API Error')
            sinon.stub(client as any, 'getDataZoneDomainPreferencesClient').rejects(error)

            await assert.rejects(() => client.listDomains(), error)
        })
    })

    describe('fetchAllDomains', () => {
        it('should fetch all domains by handling pagination', async () => {
            const listDomainsStub = sinon.stub()

            // First call returns first page with nextToken
            listDomainsStub.onFirstCall().resolves({
                domains: [
                    {
                        id: 'dzd_domain1',
                        name: 'Domain 1',
                        arn: 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_domain1',
                        managedAccountId: '123456789012',
                        status: 'AVAILABLE',
                    } as DataZoneDomain,
                ],
                nextToken: 'next-page-token',
            })

            // Second call returns second page with no nextToken
            listDomainsStub.onSecondCall().resolves({
                domains: [
                    {
                        id: 'dzd_domain2',
                        name: 'Domain 2',
                        arn: 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_domain2',
                        managedAccountId: '123456789012',
                        status: 'AVAILABLE',
                    } as DataZoneDomain,
                ],
                nextToken: undefined,
            })

            // Replace the listDomains method with our stub
            client.listDomains = listDomainsStub

            const result = await client.fetchAllDomains({ status: 'AVAILABLE' })

            assert.strictEqual(result.length, 2)
            assert.strictEqual(result[0].id, 'dzd_domain1')
            assert.strictEqual(result[1].id, 'dzd_domain2')

            // Verify listDomains was called correctly
            assert.strictEqual(listDomainsStub.callCount, 2)
            assert.deepStrictEqual(listDomainsStub.firstCall.args[0], {
                status: 'AVAILABLE',
                maxResults: 25,
                nextToken: undefined,
            })
            assert.deepStrictEqual(listDomainsStub.secondCall.args[0], {
                status: 'AVAILABLE',
                maxResults: 25,
                nextToken: 'next-page-token',
            })
        })

        it('should return empty array when no domains found', async () => {
            const listDomainsStub = sinon.stub().resolves({
                domains: [],
                nextToken: undefined,
            })

            client.listDomains = listDomainsStub

            const result = await client.fetchAllDomains()

            assert.strictEqual(result.length, 0)
            assert.strictEqual(listDomainsStub.callCount, 1)
        })

        it('should handle errors gracefully', async () => {
            const listDomainsStub = sinon.stub().rejects(new Error('API error'))

            client.listDomains = listDomainsStub

            await assert.rejects(() => client.fetchAllDomains(), /API error/)
        })
    })

    describe('getDomain', () => {
        it('should find EXPRESS domain', async () => {
            const listDomainsStub = sinon.stub()

            listDomainsStub.onFirstCall().resolves({
                domains: [
                    {
                        id: 'dzd_standard',
                        name: 'Standard Domain',
                        arn: 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_standard',
                        managedAccountId: '123456789012',
                        status: 'AVAILABLE',
                        preferences: { DOMAIN_MODE: 'STANDARD' },
                    },
                    {
                        id: 'dzd_express',
                        name: 'Express Domain',
                        arn: 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_express',
                        managedAccountId: '123456789012',
                        status: 'AVAILABLE',
                        preferences: { DOMAIN_MODE: 'EXPRESS' },
                    },
                ] as DataZoneDomain[],
                nextToken: 'next-token',
            })

            client.listDomains = listDomainsStub

            const result = await client.getExpressDomain()

            assert.ok(result)
            assert.strictEqual(result.id, 'dzd_express')
            assert.strictEqual(result.name, 'Express Domain')
            assert.strictEqual(result.preferences.DOMAIN_MODE, 'EXPRESS')

            // Should only call once since EXPRESS domain found on first page
            assert.strictEqual(listDomainsStub.callCount, 1)
        })

        it('should return undefined when no EXPRESS domain found', async () => {
            const listDomainsStub = sinon.stub()

            listDomainsStub.onFirstCall().resolves({
                domains: [
                    {
                        id: 'dzd_standard',
                        name: 'Standard Domain',
                        arn: 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_standard',
                        managedAccountId: '123456789012',
                        status: 'AVAILABLE',
                        preferences: { DOMAIN_MODE: 'STANDARD' },
                    },
                ] as DataZoneDomain[],
                nextToken: undefined,
            })

            client.listDomains = listDomainsStub

            const result = await client.getExpressDomain()

            assert.strictEqual(result, undefined)
            assert.strictEqual(listDomainsStub.callCount, 1)
        })

        it('should return undefined when no domains found', async () => {
            const listDomainsStub = sinon.stub().resolves({
                domains: [],
                nextToken: undefined,
            })

            client.listDomains = listDomainsStub

            const result = await client.getExpressDomain()

            assert.strictEqual(result, undefined)
            assert.strictEqual(listDomainsStub.callCount, 1)
        })

        it('should handle domains without preferences', async () => {
            const listDomainsStub = sinon.stub()

            listDomainsStub.onFirstCall().resolves({
                domains: [
                    {
                        id: 'dzd_no_prefs',
                        name: 'Domain Without Preferences',
                        arn: 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_no_prefs',
                        managedAccountId: '123456789012',
                        status: 'AVAILABLE',
                        // No preferences field
                    },
                ] as DataZoneDomain[],
                nextToken: undefined,
            })

            client.listDomains = listDomainsStub

            const result = await client.getExpressDomain()

            assert.strictEqual(result, undefined)
        })

        it('should handle API errors', async () => {
            const listDomainsStub = sinon.stub().rejects(new Error('API error'))

            client.listDomains = listDomainsStub

            await assert.rejects(() => client.getExpressDomain(), /Failed to get domain info: API error/)
        })
    })
})
