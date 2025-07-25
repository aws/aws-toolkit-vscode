/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon, { SinonStub } from 'sinon'
import {
    DataZoneClient,
    setDefaultDatazoneDomainId,
    resetDefaultDatazoneDomainId,
} from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'

describe('DataZoneClient', function () {
    const testDomainId = 'test-domain-123'
    const projectId = 'test-project-456'

    let datazoneClientStub: SinonStub

    beforeEach(() => {
        // Set mock domain ID
        setDefaultDatazoneDomainId(testDomainId)

        datazoneClientStub = sinon.stub().returns({
            listEnvironmentBlueprints: sinon.stub().resolves({
                items: [{ id: 'blueprint-123', name: 'Tooling' }],
            }),
            listEnvironments: sinon.stub().resolves({
                items: [{ id: 'env-123', name: 'Tooling' }],
            }),
            getEnvironmentCredentials: sinon.stub().resolves({
                accessKeyId: 'AKIATEST',
                secretAccessKey: 'secret',
                sessionToken: 'token',
            }),
            listProjects: sinon.stub().resolves({
                items: [
                    {
                        id: projectId,
                        name: 'Test Project',
                        description: 'Test Description',
                    },
                ],
                nextToken: undefined,
            }),
        })
    })

    afterEach(() => {
        sinon.restore()
        resetDefaultDatazoneDomainId()
    })

    describe('getInstance', function () {
        it('creates singleton instance with default region', function () {
            const client = DataZoneClient.getInstance()
            assert.strictEqual(client.getRegion(), 'us-east-1')
        })

        it('returns same instance on subsequent calls', function () {
            const client1 = DataZoneClient.getInstance()
            const client2 = DataZoneClient.getInstance()
            assert.strictEqual(client1, client2)
        })
    })

    describe('dispose', function () {
        it('cleans up singleton instance', function () {
            // Get an instance first
            const client = DataZoneClient.getInstance()
            assert.ok(client)

            // Dispose the instance
            DataZoneClient.dispose()

            // After disposal, a new instance should be created
            const newClient = DataZoneClient.getInstance()
            assert.notStrictEqual(client, newClient)
        })
    })

    describe('getProjectDefaultEnvironmentCreds', function () {
        it('retrieves environment credentials successfully', async function () {
            const client = DataZoneClient.getInstance()
            // Mock the private getDataZoneClient method
            ;(client as any).getDataZoneClient = sinon.stub().resolves(datazoneClientStub())

            const result = await client.getProjectDefaultEnvironmentCreds(testDomainId, projectId)

            assert.strictEqual(result.accessKeyId, 'AKIATEST')
            assert.strictEqual(result.secretAccessKey, 'secret')
            assert.strictEqual(result.sessionToken, 'token')
        })

        it('throws error when tooling blueprint not found', async function () {
            const client = DataZoneClient.getInstance()
            const mockClient = datazoneClientStub()
            mockClient.listEnvironmentBlueprints.resolves({ items: [] })
            ;(client as any).getDataZoneClient = sinon.stub().resolves(mockClient)

            await assert.rejects(
                () => client.getProjectDefaultEnvironmentCreds(testDomainId, projectId),
                /Failed to get tooling blueprint/
            )
        })

        it('throws error when default environment not found', async function () {
            const client = DataZoneClient.getInstance()
            const mockClient = datazoneClientStub()
            mockClient.listEnvironments.resolves({ items: [] })
            ;(client as any).getDataZoneClient = sinon.stub().resolves(mockClient)

            await assert.rejects(
                () => client.getProjectDefaultEnvironmentCreds(testDomainId, projectId),
                /Failed to find default Tooling environment/
            )
        })
    })

    describe('listProjects', function () {
        it('lists projects successfully', async function () {
            const client = DataZoneClient.getInstance()
            ;(client as any).getDataZoneClient = sinon.stub().resolves(datazoneClientStub())

            const result = await client.listProjects({ domainId: testDomainId })

            assert.strictEqual(result.projects.length, 1)
            assert.strictEqual(result.projects[0].id, projectId)
            assert.strictEqual(result.projects[0].name, 'Test Project')
            assert.strictEqual(result.projects[0].domainId, testDomainId)
            assert.strictEqual(result.nextToken, undefined)
        })

        it('returns empty array when no projects found', async function () {
            const client = DataZoneClient.getInstance()
            const mockClient = datazoneClientStub()
            mockClient.listProjects.resolves({ items: [], nextToken: undefined })
            ;(client as any).getDataZoneClient = sinon.stub().resolves(mockClient)

            const result = await client.listProjects()

            assert.strictEqual(result.projects.length, 0)
            assert.strictEqual(result.nextToken, undefined)
            // Verify it used the mocked default domain ID
            assert(
                mockClient.listProjects.calledWith({
                    domainIdentifier: testDomainId,
                    maxResults: undefined,
                    userIdentifier: undefined,
                    groupIdentifier: undefined,
                    name: undefined,
                    nextToken: undefined,
                })
            )
        })

        it('uses provided domain ID over default', async function () {
            const client = DataZoneClient.getInstance()
            const mockClient = datazoneClientStub()
            ;(client as any).getDataZoneClient = sinon.stub().resolves(mockClient)

            await client.listProjects({ domainId: 'custom-domain' })

            assert(
                mockClient.listProjects.calledWith({
                    domainIdentifier: 'custom-domain',
                    maxResults: undefined,
                    userIdentifier: undefined,
                    groupIdentifier: undefined,
                    name: undefined,
                    nextToken: undefined,
                })
            )
        })
    })

    describe('fetchAllProjects', function () {
        it('fetches all projects by handling pagination', async function () {
            const client = DataZoneClient.getInstance()

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
            const result = await client.fetchAllProjects({ domainId: testDomainId })

            // Verify results
            assert.strictEqual(result.length, 2)
            assert.strictEqual(result[0].id, 'project-1')
            assert.strictEqual(result[1].id, 'project-2')

            // Verify listProjects was called correctly
            assert.strictEqual(listProjectsStub.callCount, 2)
            assert.deepStrictEqual(listProjectsStub.firstCall.args[0], {
                domainId: testDomainId,
                maxResults: 50,
                nextToken: undefined,
            })
            assert.deepStrictEqual(listProjectsStub.secondCall.args[0], {
                domainId: testDomainId,
                maxResults: 50,
                nextToken: 'next-page-token',
            })
        })

        it('returns empty array when no projects found', async function () {
            const client = DataZoneClient.getInstance()

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
            const client = DataZoneClient.getInstance()

            // Create a stub for listProjects that throws an error
            const listProjectsStub = sinon.stub().rejects(new Error('API error'))

            // Replace the listProjects method with our stub
            client.listProjects = listProjectsStub

            // Call fetchAllProjects and expect it to throw
            await assert.rejects(() => client.fetchAllProjects(), /API error/)
        })
    })
})
