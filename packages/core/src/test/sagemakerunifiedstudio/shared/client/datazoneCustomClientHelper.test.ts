/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { DataZoneCustomClientHelper } from '../../../../sagemakerunifiedstudio/shared/client/datazoneCustomClientHelper'
import {
    DomainSummary,
    ListDomainsCommand,
    GetDomainCommand,
    SearchGroupProfilesCommand,
    SearchUserProfilesCommand,
} from '@amzn/datazone-custom-client'

type DataZoneDomain = DomainSummary

describe('DataZoneCustomClientHelper', () => {
    let client: DataZoneCustomClientHelper
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
        DataZoneCustomClientHelper.dispose()
        client = DataZoneCustomClientHelper.getInstance(mockAuthProvider, testRegion)
    })

    afterEach(() => {
        sinon.restore()
        DataZoneCustomClientHelper.dispose()
    })

    describe('getInstance', () => {
        it('should return singleton instance for same region', () => {
            const instance1 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, testRegion)
            const instance2 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, testRegion)

            assert.strictEqual(instance1, instance2)
        })

        it('should create different instances for different regions', () => {
            const instance1 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, 'us-east-1')
            const instance2 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, 'us-west-2')

            assert.notStrictEqual(instance1, instance2)
        })

        it('should create new instance after dispose', () => {
            const instance1 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, testRegion)
            DataZoneCustomClientHelper.dispose()
            const instance2 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, testRegion)

            assert.notStrictEqual(instance1, instance2)
        })
    })

    describe('dispose', () => {
        it('should clear all instances', () => {
            const instance1 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, 'us-east-1')
            const instance2 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, 'us-west-2')

            DataZoneCustomClientHelper.dispose()

            // Should create new instance after dispose
            const newInstance1 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, 'us-east-1')
            const newInstance2 = DataZoneCustomClientHelper.getInstance(mockAuthProvider, 'us-west-2')

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
                        createdAt: new Date('2023-01-01T00:00:00Z'),
                        lastUpdatedAt: new Date('2023-01-02T00:00:00Z'),
                        domainVersion: '1.0',
                        preferences: { DOMAIN_MODE: 'STANDARD' },
                    },
                ],
                nextToken: 'next-token',
            }

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(ListDomainsCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

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

            // Verify API was called with correct command type and parameters
            assert.ok(mockDataZoneClient.send.calledOnce)
            const command = mockDataZoneClient.send.firstCall.args[0]
            assert.strictEqual(command.input.maxResults, 10)
            assert.strictEqual(command.input.status, 'AVAILABLE')
        })

        it('should handle empty results', async () => {
            const mockResponse = {
                items: [],
                nextToken: undefined,
            }

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(ListDomainsCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            const result = await client.listDomains()

            assert.strictEqual(result.domains.length, 0)
            assert.strictEqual(result.nextToken, undefined)
        })

        it('should handle API errors', async () => {
            const error = new Error('API Error')
            sinon.stub(client as any, 'getDataZoneCustomClient').rejects(error)

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
                        createdAt: new Date(),
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
                        createdAt: new Date(),
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
                        createdAt: new Date(),
                        domainVersion: 'V2',
                        iamSignIns: ['IAM_ROLE'],
                        preferences: { DOMAIN_MODE: 'STANDARD' },
                    },
                    {
                        id: 'dzd_express',
                        name: 'Express Domain',
                        arn: 'arn:aws:datazone:us-east-1:123456789012:domain/dzd_express',
                        managedAccountId: '123456789012',
                        status: 'AVAILABLE',
                        createdAt: new Date(),
                        domainVersion: 'V2',
                        iamSignIns: ['IAM_ROLE', 'IAM_USER'],
                        preferences: { DOMAIN_MODE: 'EXPRESS' },
                    },
                ] as DataZoneDomain[],
                nextToken: 'next-token',
            })

            client.listDomains = listDomainsStub

            const result = await client.getIamDomain()

            assert.ok(result)
            assert.strictEqual(result.id, 'dzd_express')
            assert.strictEqual(result.name, 'Express Domain')
            assert.strictEqual(result.preferences?.DOMAIN_MODE, 'EXPRESS')

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
                        createdAt: new Date(),
                        preferences: { DOMAIN_MODE: 'STANDARD' },
                    },
                ] as DataZoneDomain[],
                nextToken: undefined,
            })

            client.listDomains = listDomainsStub

            const result = await client.getIamDomain()

            assert.strictEqual(result, undefined)
            assert.strictEqual(listDomainsStub.callCount, 1)
        })

        it('should return undefined when no domains found', async () => {
            const listDomainsStub = sinon.stub().resolves({
                domains: [],
                nextToken: undefined,
            })

            client.listDomains = listDomainsStub

            const result = await client.getIamDomain()

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
                        createdAt: new Date(),
                        // No preferences field
                    },
                ] as DataZoneDomain[],
                nextToken: undefined,
            })

            client.listDomains = listDomainsStub

            const result = await client.getIamDomain()

            assert.strictEqual(result, undefined)
        })

        it('should handle API errors', async () => {
            const listDomainsStub = sinon.stub().rejects(new Error('API error'))

            client.listDomains = listDomainsStub

            await assert.rejects(() => client.getIamDomain(), /Failed to get domain info: API error/)
        })
    })

    describe('getDomain', () => {
        it('should get domain by ID successfully', async () => {
            const mockDomainId = 'dzd_test123'
            const mockResponse = {
                id: mockDomainId,
                name: 'Test Domain',
                description: 'A test domain',
                arn: `arn:aws:datazone:us-east-1:123456789012:domain/${mockDomainId}`,
                status: 'AVAILABLE',
                portalUrl: 'https://test.datazone.aws',
                createdAt: '2023-01-01T00:00:00Z',
                lastUpdatedAt: '2023-01-02T00:00:00Z',
                domainVersion: '1.0',
                preferences: { DOMAIN_MODE: 'EXPRESS' },
            }
            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(GetDomainCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            const result = await client.getDomain(mockDomainId)

            assert.strictEqual(result.id, mockDomainId)
            assert.strictEqual(result.name, 'Test Domain')
            assert.strictEqual(result.description, 'A test domain')
            assert.strictEqual(result.arn, `arn:aws:datazone:us-east-1:123456789012:domain/${mockDomainId}`)
            assert.strictEqual(result.status, 'AVAILABLE')
            assert.strictEqual(result.portalUrl, 'https://test.datazone.aws')
            assert.strictEqual(result.domainVersion, '1.0')
            assert.deepStrictEqual(result.preferences, { DOMAIN_MODE: 'EXPRESS' })

            // Verify the API was called with correct command type and parameters
            assert.ok(mockDataZoneClient.send.calledOnce)
            const command = mockDataZoneClient.send.firstCall.args[0]
            assert.strictEqual(command.input.identifier, mockDomainId)
        })

        it('should handle API errors when getting domain', async () => {
            const mockDomainId = 'dzd_test123'
            const error = new Error('Domain not found')

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(GetDomainCommand)).rejects(error),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            await assert.rejects(() => client.getDomain(mockDomainId), error)

            // Verify the API was called with correct parameters
            assert.ok(mockDataZoneClient.send.calledOnce)
            const command = mockDataZoneClient.send.firstCall.args[0]
            assert.strictEqual(command.input.identifier, mockDomainId)
        })
    })

    describe('searchGroupProfiles', () => {
        const mockDomainId = 'dzd_test123'

        it('should search group profiles successfully', async () => {
            const mockResponse = {
                items: [
                    {
                        domainId: mockDomainId,
                        id: 'gp_profile1',
                        status: 'ASSIGNED',
                        groupName: 'AdminGroup',
                        rolePrincipalArn: 'arn:aws:iam::123456789012:role/AdminRole',
                        rolePrincipalId: 'AIDAI123456789EXAMPLE',
                    },
                    {
                        domainId: mockDomainId,
                        id: 'gp_profile2',
                        status: 'ASSIGNED',
                        groupName: 'DeveloperGroup',
                        rolePrincipalArn: 'arn:aws:iam::123456789012:role/DeveloperRole',
                        rolePrincipalId: 'AIDAI987654321EXAMPLE',
                    },
                ],
                nextToken: 'next-token',
            }

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(SearchGroupProfilesCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            const result = await client.searchGroupProfiles(mockDomainId, {
                groupType: 'IAM_ROLE_SESSION_GROUP',
                maxResults: 50,
            })

            assert.strictEqual(result.items.length, 2)
            assert.strictEqual(result.items[0].id, 'gp_profile1')
            assert.strictEqual(result.items[0].rolePrincipalArn, 'arn:aws:iam::123456789012:role/AdminRole')
            assert.strictEqual(result.items[1].id, 'gp_profile2')
            assert.strictEqual(result.nextToken, 'next-token')

            // Verify API was called with correct command type and parameters
            assert.ok(mockDataZoneClient.send.calledOnce)
            const command = mockDataZoneClient.send.firstCall.args[0]
            assert.strictEqual(command.input.domainIdentifier, mockDomainId)
            assert.strictEqual(command.input.groupType, 'IAM_ROLE_SESSION_GROUP')
            assert.strictEqual(command.input.maxResults, 50)
        })

        it('should handle empty results', async () => {
            const mockResponse = {
                items: [],
                nextToken: undefined,
            }

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(SearchGroupProfilesCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            const result = await client.searchGroupProfiles(mockDomainId)

            assert.strictEqual(result.items.length, 0)
            assert.strictEqual(result.nextToken, undefined)
        })

        it('should handle API errors', async () => {
            const error = new Error('API Error')
            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(SearchGroupProfilesCommand)).rejects(error),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            await assert.rejects(() => client.searchGroupProfiles(mockDomainId), error)
        })

        it('should support pagination with nextToken', async () => {
            const mockResponse = {
                items: [
                    {
                        domainId: mockDomainId,
                        id: 'gp_profile3',
                        status: 'ASSIGNED',
                        groupName: 'TestGroup',
                        rolePrincipalArn: 'arn:aws:iam::123456789012:role/TestRole',
                        rolePrincipalId: 'AIDAI111111111EXAMPLE',
                    },
                ],
                nextToken: undefined,
            }

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(SearchGroupProfilesCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            const result = await client.searchGroupProfiles(mockDomainId, {
                nextToken: 'previous-token',
            })

            assert.strictEqual(result.items.length, 1)
            assert.strictEqual(result.nextToken, undefined)

            // Verify send was called with correct command type and parameters
            assert.ok(mockDataZoneClient.send.calledOnce)
            const command = mockDataZoneClient.send.firstCall.args[0]
            assert.strictEqual(command.input.domainIdentifier, mockDomainId)
            assert.strictEqual(command.input.nextToken, 'previous-token')
        })
    })

    describe('searchUserProfiles', () => {
        const mockDomainId = 'dzd_test123'

        it('should search user profiles successfully', async () => {
            const mockResponse = {
                items: [
                    {
                        domainId: mockDomainId,
                        id: 'up_user1',
                        type: 'IAM',
                        status: 'ACTIVATED',
                        details: {
                            iam: {
                                arn: 'arn:aws:iam::123456789012:role/AdminRole',
                                principalId: 'AIDAI123456789EXAMPLE:session1',
                            },
                        },
                    },
                    {
                        domainId: mockDomainId,
                        id: 'up_user2',
                        type: 'IAM',
                        status: 'ACTIVATED',
                        details: {
                            iam: {
                                arn: 'arn:aws:iam::123456789012:role/DeveloperRole',
                                principalId: 'AIDAI987654321EXAMPLE:session2',
                            },
                        },
                    },
                ],
                nextToken: 'next-token',
            }

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(SearchUserProfilesCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            const result = await client.searchUserProfiles(mockDomainId, {
                userType: 'DATAZONE_IAM_USER',
                maxResults: 50,
            })

            assert.strictEqual(result.items.length, 2)
            assert.strictEqual(result.items[0].id, 'up_user1')
            assert.strictEqual(result.items[0].details?.iam?.principalId, 'AIDAI123456789EXAMPLE:session1')
            assert.strictEqual(result.items[1].id, 'up_user2')
            assert.strictEqual(result.nextToken, 'next-token')

            // Verify API was called with correct command type and parameters
            assert.ok(mockDataZoneClient.send.calledOnce)
            const command = mockDataZoneClient.send.firstCall.args[0]
            assert.strictEqual(command.input.domainIdentifier, mockDomainId)
            assert.strictEqual(command.input.userType, 'DATAZONE_IAM_USER')
            assert.strictEqual(command.input.maxResults, 50)
        })

        it('should handle SSO user profiles', async () => {
            const mockResponse = {
                items: [
                    {
                        domainId: mockDomainId,
                        id: 'up_sso_user',
                        type: 'SSO',
                        status: 'ACTIVATED',
                        details: {
                            sso: {
                                firstName: 'John',
                                lastName: 'Doe',
                                username: 'jdoe',
                            },
                        },
                    },
                ],
                nextToken: undefined,
            }

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(SearchUserProfilesCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            const result = await client.searchUserProfiles(mockDomainId, {
                userType: 'SSO_USER',
            })

            assert.strictEqual(result.items.length, 1)
            assert.strictEqual(result.items[0].details?.sso?.username, 'jdoe')
            assert.strictEqual(result.items[0].details?.sso?.firstName, 'John')
        })

        it('should handle empty results', async () => {
            const mockResponse = {
                items: [],
                nextToken: undefined,
            }

            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(SearchUserProfilesCommand)).resolves(mockResponse),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            const result = await client.searchUserProfiles(mockDomainId, {
                userType: 'DATAZONE_IAM_USER',
            })

            assert.strictEqual(result.items.length, 0)
            assert.strictEqual(result.nextToken, undefined)
        })

        it('should handle API errors', async () => {
            const error = new Error('API Error')
            const mockDataZoneClient = {
                send: sinon.stub().withArgs(sinon.match.instanceOf(SearchUserProfilesCommand)).rejects(error),
            }

            sinon.stub(client as any, 'getDataZoneCustomClient').resolves(mockDataZoneClient)

            await assert.rejects(
                () =>
                    client.searchUserProfiles(mockDomainId, {
                        userType: 'DATAZONE_IAM_USER',
                    }),
                error
            )
        })
    })

    describe('getGroupProfileId', () => {
        const mockDomainId = 'dzd_test123'
        const mockRoleArn = 'arn:aws:iam::123456789012:role/AdminRole'

        it('should find matching group profile on first page', async () => {
            const searchStub = sinon.stub(client, 'searchGroupProfiles')
            searchStub.onFirstCall().resolves({
                items: [
                    {
                        id: 'gp_profile1',
                        rolePrincipalArn: mockRoleArn,
                        status: 'ASSIGNED',
                    },
                ],
                nextToken: undefined,
            })

            const result = await client.getGroupProfileId(mockDomainId, mockRoleArn)

            assert.strictEqual(result, 'gp_profile1')
            assert.ok(searchStub.calledOnce)
            assert.strictEqual(searchStub.firstCall.args[0], mockDomainId)
            assert.strictEqual(searchStub.firstCall.args[1]?.groupType, 'IAM_ROLE_SESSION_GROUP')
        })

        it('should throw ToolkitError when no matching profile found', async () => {
            const searchStub = sinon.stub(client, 'searchGroupProfiles')
            searchStub.resolves({
                items: [
                    {
                        id: 'gp_profile1',
                        rolePrincipalArn: 'arn:aws:iam::123456789012:role/OtherRole',
                        status: 'ASSIGNED',
                    },
                ],
                nextToken: undefined,
            })

            await assert.rejects(
                () => client.getGroupProfileId(mockDomainId, mockRoleArn),
                (err: any) => {
                    assert.ok(err.message.includes('No group profile found'))
                    assert.strictEqual(err.code, 'NoGroupProfileFound')
                    return true
                }
            )
        })

        it('should handle API errors', async () => {
            const searchStub = sinon.stub(client, 'searchGroupProfiles')
            searchStub.rejects(new Error('API Error'))

            await assert.rejects(
                () => client.getGroupProfileId(mockDomainId, mockRoleArn),
                (err: any) => {
                    assert.ok(err.message.includes('Failed to get group profile ID'))
                    return true
                }
            )
        })
    })

    describe('getUserProfileIdForSession', () => {
        const mockDomainId = 'dzd_test123'
        const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/AdminRole/my-session'

        it('should find matching user profile by role ARN and session name', async () => {
            const searchStub = sinon.stub(client, 'searchUserProfiles')
            searchStub.onFirstCall().resolves({
                items: [
                    {
                        id: 'up_user1',
                        status: 'ACTIVATED',
                        details: {
                            iam: {
                                arn: 'arn:aws:iam::123456789012:role/AdminRole',
                                principalId: 'AIDAI123456789EXAMPLE:my-session',
                            },
                        },
                    },
                ],
                nextToken: undefined,
            })

            const result = await client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn)

            assert.strictEqual(result, 'up_user1')
            assert.ok(searchStub.calledOnce)
            assert.strictEqual(searchStub.firstCall.args[0], mockDomainId)
            assert.strictEqual(searchStub.firstCall.args[1].userType, 'DATAZONE_IAM_USER')
            assert.strictEqual(searchStub.firstCall.args[1].searchText, 'arn:aws:iam::123456789012:role/AdminRole')
        })

        it('should find matching user profile across multiple pages', async () => {
            const searchStub = sinon.stub(client, 'searchUserProfiles')

            // First page - no match (different session name)
            searchStub.onFirstCall().resolves({
                items: [
                    {
                        id: 'up_user1',
                        status: 'ACTIVATED',
                        details: {
                            iam: {
                                arn: 'arn:aws:iam::123456789012:role/AdminRole',
                                principalId: 'AIDAI123456789EXAMPLE:other-session',
                            },
                        },
                    },
                ],
                nextToken: 'next-token',
            })

            // Second page - match found
            searchStub.onSecondCall().resolves({
                items: [
                    {
                        id: 'up_user2',
                        status: 'ACTIVATED',
                        details: {
                            iam: {
                                arn: 'arn:aws:iam::123456789012:role/AdminRole',
                                principalId: 'AIDAI987654321EXAMPLE:my-session',
                            },
                        },
                    },
                ],
                nextToken: undefined,
            })

            const result = await client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn)

            assert.strictEqual(result, 'up_user2')
            assert.strictEqual(searchStub.callCount, 2)
        })

        it('should throw ToolkitError when session name cannot be extracted', async () => {
            const invalidArn = 'arn:aws:iam::123456789012:role/AdminRole'

            await assert.rejects(
                () => client.getUserProfileIdForSession(mockDomainId, invalidArn),
                (err: any) => {
                    assert.ok(err.message.includes('Unable to extract session name'))
                    assert.strictEqual(err.code, 'NoUserProfileFound')
                    return true
                }
            )
        })

        it('should throw ToolkitError when no matching profile found', async () => {
            const searchStub = sinon.stub(client, 'searchUserProfiles')
            searchStub.resolves({
                items: [
                    {
                        id: 'up_user1',
                        status: 'ACTIVATED',
                        details: {
                            iam: {
                                arn: 'arn:aws:iam::123456789012:role/AdminRole',
                                principalId: 'AIDAI123456789EXAMPLE:other-session',
                            },
                        },
                    },
                ],
                nextToken: undefined,
            })

            await assert.rejects(
                () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                (err: any) => {
                    assert.ok(err.message.includes('No user profile found'))
                    assert.strictEqual(err.code, 'NoUserProfileFound')
                    return true
                }
            )
        })

        it('should handle profiles without IAM details', async () => {
            const searchStub = sinon.stub(client, 'searchUserProfiles')
            searchStub.resolves({
                items: [
                    {
                        id: 'up_user1',
                        status: 'ASSIGNED',
                        details: undefined,
                    },
                ],
                nextToken: undefined,
            })

            await assert.rejects(
                () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                (err: any) => {
                    assert.ok(err.message.includes('No user profile found'))
                    return true
                }
            )
        })

        it('should handle API errors', async () => {
            const searchStub = sinon.stub(client, 'searchUserProfiles')
            searchStub.rejects(new Error('API Error'))

            await assert.rejects(
                () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                (err: any) => {
                    assert.ok(err.message.includes('Failed to get user profile ID'))
                    return true
                }
            )
        })

        it('should handle various role ARN formats', async () => {
            const testCases = [
                {
                    arn: 'arn:aws:sts::123456789012:assumed-role/MyRole/session-123',
                    expectedSession: 'session-123',
                },
                {
                    arn: 'arn:aws:sts::123456789012:assumed-role/DeveloperRole/user-session-name',
                    expectedSession: 'user-session-name',
                },
                {
                    arn: 'arn:aws:sts::999888777666:assumed-role/AdminRole/admin-session',
                    expectedSession: 'admin-session',
                },
            ]

            for (const testCase of testCases) {
                const searchStub = sinon.stub(client, 'searchUserProfiles')
                searchStub.resolves({
                    items: [
                        {
                            id: 'up_test',
                            status: 'ACTIVATED',
                            details: {
                                iam: {
                                    principalId: `PRINCIPAL:${testCase.expectedSession}`,
                                },
                            },
                        },
                    ],
                    nextToken: undefined,
                })

                const result = await client.getUserProfileIdForSession(mockDomainId, testCase.arn)
                assert.strictEqual(result, 'up_test')

                searchStub.restore()
            }
        })
    })

    describe('Project and Space Filtering', () => {
        const mockDomainId = 'dzd_test123'

        describe('Project filtering by group profile', () => {
            it('should filter projects when group profile is found', async () => {
                const mockRoleArn = 'arn:aws:iam::123456789012:role/AdminRole'
                const mockGroupProfileId = 'gp_profile1'

                const searchStub = sinon.stub(client, 'searchGroupProfiles')
                searchStub.resolves({
                    items: [
                        {
                            id: mockGroupProfileId,
                            rolePrincipalArn: mockRoleArn,
                            status: 'ASSIGNED',
                        },
                    ],
                    nextToken: undefined,
                })

                const result = await client.getGroupProfileId(mockDomainId, mockRoleArn)

                assert.strictEqual(result, mockGroupProfileId)
                assert.ok(searchStub.calledOnce)
            })

            it('should handle empty project list for group profile', async () => {
                const mockRoleArn = 'arn:aws:iam::123456789012:role/AdminRole'

                const searchStub = sinon.stub(client, 'searchGroupProfiles')
                searchStub.resolves({
                    items: [],
                    nextToken: undefined,
                })

                await assert.rejects(
                    () => client.getGroupProfileId(mockDomainId, mockRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('No group profile found'))
                        assert.strictEqual(err.code, 'NoGroupProfileFound')
                        return true
                    }
                )
            })

            it('should handle API errors during project filtering', async () => {
                const mockRoleArn = 'arn:aws:iam::123456789012:role/AdminRole'

                const searchStub = sinon.stub(client, 'searchGroupProfiles')
                searchStub.rejects(new Error('API Error'))

                await assert.rejects(
                    () => client.getGroupProfileId(mockDomainId, mockRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('Failed to get group profile ID'))
                        return true
                    }
                )
            })

            it('should handle AccessDeniedException during project filtering', async () => {
                const mockRoleArn = 'arn:aws:iam::123456789012:role/AdminRole'
                const accessDeniedError = new Error('Access denied')
                accessDeniedError.name = 'AccessDeniedException'

                const searchStub = sinon.stub(client, 'searchGroupProfiles')
                searchStub.rejects(accessDeniedError)

                await assert.rejects(
                    () => client.getGroupProfileId(mockDomainId, mockRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('Failed to get group profile ID'))
                        return true
                    }
                )
            })
        })

        describe('Space filtering by user profile', () => {
            it('should filter spaces when user profile is found', async () => {
                const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/AdminRole/my-session'
                const mockUserProfileId = 'up_user1'

                const searchStub = sinon.stub(client, 'searchUserProfiles')
                searchStub.resolves({
                    items: [
                        {
                            id: mockUserProfileId,
                            status: 'ACTIVATED',
                            details: {
                                iam: {
                                    arn: 'arn:aws:iam::123456789012:role/AdminRole',
                                    principalId: 'AIDAI123456789EXAMPLE:my-session',
                                },
                            },
                        },
                    ],
                    nextToken: undefined,
                })

                const result = await client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn)

                assert.strictEqual(result, mockUserProfileId)
                assert.ok(searchStub.calledOnce)
            })

            it('should handle empty space list for user profile', async () => {
                const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/AdminRole/my-session'

                const searchStub = sinon.stub(client, 'searchUserProfiles')
                searchStub.resolves({
                    items: [],
                    nextToken: undefined,
                })

                await assert.rejects(
                    () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('No user profile found'))
                        assert.strictEqual(err.code, 'NoUserProfileFound')
                        return true
                    }
                )
            })

            it('should handle API errors during space filtering', async () => {
                const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/AdminRole/my-session'

                const searchStub = sinon.stub(client, 'searchUserProfiles')
                searchStub.rejects(new Error('API Error'))

                await assert.rejects(
                    () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('Failed to get user profile ID'))
                        return true
                    }
                )
            })

            it('should handle AccessDeniedException during space filtering', async () => {
                const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/AdminRole/my-session'
                const accessDeniedError = new Error('Access denied')
                accessDeniedError.name = 'AccessDeniedException'

                const searchStub = sinon.stub(client, 'searchUserProfiles')
                searchStub.rejects(accessDeniedError)

                await assert.rejects(
                    () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('Failed to get user profile ID'))
                        return true
                    }
                )
            })

            it('should handle profiles with missing principalId', async () => {
                const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/AdminRole/my-session'

                const searchStub = sinon.stub(client, 'searchUserProfiles')
                searchStub.resolves({
                    items: [
                        {
                            id: 'up_user1',
                            status: 'ACTIVATED',
                            details: {
                                iam: {
                                    // Missing principalId
                                },
                            },
                        },
                    ],
                    nextToken: undefined,
                })

                await assert.rejects(
                    () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('No user profile found'))
                        return true
                    }
                )
            })
        })

        describe('Error scenarios in filtering logic', () => {
            it('should handle network errors during group profile search', async () => {
                const mockRoleArn = 'arn:aws:iam::123456789012:role/AdminRole'
                const networkError = new Error('Network error')
                networkError.name = 'NetworkError'

                const searchStub = sinon.stub(client, 'searchGroupProfiles')
                searchStub.rejects(networkError)

                await assert.rejects(
                    () => client.getGroupProfileId(mockDomainId, mockRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('Failed to get group profile ID'))
                        return true
                    }
                )
            })

            it('should handle network errors during user profile search', async () => {
                const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/AdminRole/my-session'
                const networkError = new Error('Network error')
                networkError.name = 'NetworkError'

                const searchStub = sinon.stub(client, 'searchUserProfiles')
                searchStub.rejects(networkError)

                await assert.rejects(
                    () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('Failed to get user profile ID'))
                        return true
                    }
                )
            })

            it('should handle timeout errors during group profile search', async () => {
                const mockRoleArn = 'arn:aws:iam::123456789012:role/AdminRole'
                const timeoutError = new Error('Request timeout')
                timeoutError.name = 'TimeoutError'

                const searchStub = sinon.stub(client, 'searchGroupProfiles')
                searchStub.rejects(timeoutError)

                await assert.rejects(
                    () => client.getGroupProfileId(mockDomainId, mockRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('Failed to get group profile ID'))
                        return true
                    }
                )
            })

            it('should handle malformed response during group profile search', async () => {
                const mockRoleArn = 'arn:aws:iam::123456789012:role/AdminRole'

                const searchStub = sinon.stub(client, 'searchGroupProfiles')
                searchStub.resolves({
                    items: [
                        {
                            // Missing required fields
                            status: 'ACTIVATED',
                        } as any,
                    ],
                    nextToken: undefined,
                })

                await assert.rejects(
                    () => client.getGroupProfileId(mockDomainId, mockRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('No group profile found'))
                        return true
                    }
                )
            })

            it('should handle malformed response during user profile search', async () => {
                const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/AdminRole/my-session'

                const searchStub = sinon.stub(client, 'searchUserProfiles')
                searchStub.resolves({
                    items: [
                        {
                            // Missing required fields
                            status: 'ACTIVATED',
                        } as any,
                    ],
                    nextToken: undefined,
                })

                await assert.rejects(
                    () => client.getUserProfileIdForSession(mockDomainId, mockAssumedRoleArn),
                    (err: any) => {
                        assert.ok(err.message.includes('No user profile found'))
                        return true
                    }
                )
            })
        })
    })
})
