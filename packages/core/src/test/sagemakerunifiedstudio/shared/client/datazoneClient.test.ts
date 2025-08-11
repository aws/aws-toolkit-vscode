/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { DataZoneClient } from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'

describe('DataZoneClient', () => {
    let dataZoneClient: DataZoneClient
    let mockAuthProvider: any
    const testDomainId = 'dzd_domainId'
    const testRegion = 'us-east-2'

    beforeEach(async () => {
        // Create mock connection object
        const mockConnection = {
            domainId: testDomainId,
            ssoRegion: testRegion,
        }

        // Create mock auth provider
        mockAuthProvider = {
            isConnected: sinon.stub().returns(true),
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns(testRegion),
            activeConnection: mockConnection,
            onDidChangeActiveConnection: sinon.stub().returns({
                dispose: sinon.stub(),
            }),
        } as any

        // Set up the DataZoneClient using getInstance since constructor is private
        DataZoneClient.dispose()
        dataZoneClient = await DataZoneClient.getInstance(mockAuthProvider)
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('getInstance', () => {
        it('should return singleton instance', async () => {
            const instance1 = await DataZoneClient.getInstance(mockAuthProvider)
            const instance2 = await DataZoneClient.getInstance(mockAuthProvider)

            assert.strictEqual(instance1, instance2)
        })

        it('should create new instance after dispose', async () => {
            const instance1 = await DataZoneClient.getInstance(mockAuthProvider)
            DataZoneClient.dispose()
            const instance2 = await DataZoneClient.getInstance(mockAuthProvider)

            assert.notStrictEqual(instance1, instance2)
        })
    })

    describe('dispose', () => {
        it('should clear singleton instance', async () => {
            const instance = await DataZoneClient.getInstance(mockAuthProvider)
            DataZoneClient.dispose()

            // Should create new instance after dispose
            const newInstance = await DataZoneClient.getInstance(mockAuthProvider)
            assert.notStrictEqual(instance, newInstance)
        })
    })

    describe('getRegion', () => {
        it('should return configured region', () => {
            const result = dataZoneClient.getRegion()
            assert.strictEqual(typeof result, 'string')
            assert.ok(result.length > 0)
        })
    })

    describe('listProjects', () => {
        it('should list projects with pagination', async () => {
            const mockDataZone = {
                listProjects: sinon.stub().resolves({
                    items: [
                        {
                            id: 'project-1',
                            name: 'Project 1',
                            description: 'First project',
                            createdAt: new Date('2023-01-01'),
                            updatedAt: new Date('2023-01-02'),
                        },
                    ],
                    nextToken: 'next-token',
                }),
            }

            // Mock the getDataZoneClient method
            sinon.stub(dataZoneClient as any, 'getDataZoneClient').resolves(mockDataZone)

            const result = await dataZoneClient.listProjects({
                maxResults: 10,
            })

            assert.strictEqual(result.projects.length, 1)
            assert.strictEqual(result.projects[0].id, 'project-1')
            assert.strictEqual(result.projects[0].name, 'Project 1')
            assert.strictEqual(result.projects[0].domainId, testDomainId)
            assert.strictEqual(result.nextToken, 'next-token')
        })

        it('should handle empty results', async () => {
            const mockDataZone = {
                listProjects: sinon.stub().resolves({
                    items: [],
                    nextToken: undefined,
                }),
            }

            sinon.stub(dataZoneClient as any, 'getDataZoneClient').resolves(mockDataZone)

            const result = await dataZoneClient.listProjects()

            assert.strictEqual(result.projects.length, 0)
            assert.strictEqual(result.nextToken, undefined)
        })

        it('should handle API errors', async () => {
            const error = new Error('API Error')
            sinon.stub(dataZoneClient as any, 'getDataZoneClient').rejects(error)

            await assert.rejects(() => dataZoneClient.listProjects(), error)
        })
    })

    describe('getProjectDefaultEnvironmentCreds', () => {
        it('should get environment credentials for project', async () => {
            const mockCredentials = {
                accessKeyId: 'AKIATEST',
                secretAccessKey: 'secret',
                sessionToken: 'token',
            }

            const mockDataZone = {
                listEnvironmentBlueprints: sinon.stub().resolves({
                    items: [{ id: 'blueprint-1', name: 'Tooling' }],
                }),
                listEnvironments: sinon.stub().resolves({
                    items: [{ id: 'env-1', name: 'Tooling' }],
                }),
                getEnvironmentCredentials: sinon.stub().resolves(mockCredentials),
            }

            sinon.stub(dataZoneClient as any, 'getDataZoneClient').resolves(mockDataZone)

            const result = await dataZoneClient.getProjectDefaultEnvironmentCreds('project-1')

            assert.deepStrictEqual(result, mockCredentials)
            assert.ok(
                mockDataZone.listEnvironmentBlueprints.calledWith({
                    domainIdentifier: testDomainId,
                    managed: true,
                    name: 'Tooling',
                })
            )
            assert.ok(
                mockDataZone.listEnvironments.calledWith({
                    domainIdentifier: testDomainId,
                    projectIdentifier: 'project-1',
                    environmentBlueprintIdentifier: 'blueprint-1',
                    provider: 'Amazon SageMaker',
                })
            )
            assert.ok(
                mockDataZone.getEnvironmentCredentials.calledWith({
                    domainIdentifier: testDomainId,
                    environmentIdentifier: 'env-1',
                })
            )
        })

        it('should throw error when tooling blueprint not found', async () => {
            const mockDataZone = {
                listEnvironmentBlueprints: sinon.stub().resolves({
                    items: [],
                }),
            }

            sinon.stub(dataZoneClient as any, 'getDataZoneClient').resolves(mockDataZone)

            await assert.rejects(
                () => dataZoneClient.getProjectDefaultEnvironmentCreds('project-1'),
                /Failed to get tooling blueprint/
            )
        })

        it('should throw error when default environment not found', async () => {
            const mockDataZone = {
                listEnvironmentBlueprints: sinon.stub().resolves({
                    items: [{ id: 'blueprint-1', name: 'Tooling' }],
                }),
                listEnvironments: sinon.stub().resolves({
                    items: [],
                }),
            }

            sinon.stub(dataZoneClient as any, 'getDataZoneClient').resolves(mockDataZone)

            await assert.rejects(
                () => dataZoneClient.getProjectDefaultEnvironmentCreds('project-1'),
                /Failed to find default Tooling environment/
            )
        })
    })

    describe('fetchAllProjects', function () {
        it('fetches all projects by handling pagination', async function () {
            const client = await DataZoneClient.getInstance(mockAuthProvider)

            // Create a stub for listProjects that returns paginated results
            const listProjectsStub = sinon.stub()

            // First call returns first page with nextToken
            listProjectsStub.onFirstCall().resolves({
                projects: [
                    {
                        id: 'project-1',
                        name: 'Project 1',
                        description: 'First project',
                        domainId: testDomainId,
                    },
                ],
                nextToken: 'next-page-token',
            })

            // Second call returns second page with no nextToken
            listProjectsStub.onSecondCall().resolves({
                projects: [
                    {
                        id: 'project-2',
                        name: 'Project 2',
                        description: 'Second project',
                        domainId: testDomainId,
                    },
                ],
                nextToken: undefined,
            })

            // Replace the listProjects method with our stub
            client.listProjects = listProjectsStub

            // Call fetchAllProjects
            const result = await client.fetchAllProjects()

            // Verify results
            assert.strictEqual(result.length, 2)
            assert.strictEqual(result[0].id, 'project-1')
            assert.strictEqual(result[1].id, 'project-2')

            // Verify listProjects was called correctly
            assert.strictEqual(listProjectsStub.callCount, 2)
            assert.deepStrictEqual(listProjectsStub.firstCall.args[0], {
                maxResults: 50,
                nextToken: undefined,
            })
            assert.deepStrictEqual(listProjectsStub.secondCall.args[0], {
                maxResults: 50,
                nextToken: 'next-page-token',
            })
        })

        it('returns empty array when no projects found', async function () {
            const client = await DataZoneClient.getInstance(mockAuthProvider)

            // Create a stub for listProjects that returns empty results
            const listProjectsStub = sinon.stub().resolves({
                projects: [],
                nextToken: undefined,
            })

            // Replace the listProjects method with our stub
            client.listProjects = listProjectsStub

            // Call fetchAllProjects
            const result = await client.fetchAllProjects()

            // Verify results
            assert.strictEqual(result.length, 0)
            assert.strictEqual(listProjectsStub.callCount, 1)
        })

        it('handles errors gracefully', async function () {
            const client = await DataZoneClient.getInstance(mockAuthProvider)

            // Create a stub for listProjects that throws an error
            const listProjectsStub = sinon.stub().rejects(new Error('API error'))

            // Replace the listProjects method with our stub
            client.listProjects = listProjectsStub

            // Call fetchAllProjects and expect it to throw
            await assert.rejects(() => client.fetchAllProjects(), /API error/)
        })
    })
})
