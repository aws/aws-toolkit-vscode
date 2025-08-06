/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { DataZoneClient } from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { ToolkitError } from '../../../../shared/errors'

describe('DataZoneClient', () => {
    let dataZoneClient: DataZoneClient
    const testDomainUrl = 'https://dzd_domainId.sagemaker.us-east-2.on.aws'
    const testDomainId = 'dzd_domainId'
    const testDomainIdLowercase = 'dzd_domainid' // Domain IDs get lowercased by URL parsing
    const testRegion = 'us-east-2'

    beforeEach(() => {
        // Set up the DataZoneClient using getInstance since constructor is private
        DataZoneClient.dispose()
        dataZoneClient = DataZoneClient.getInstance()
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('getInstance', () => {
        it('should return singleton instance', () => {
            const instance1 = DataZoneClient.getInstance()
            const instance2 = DataZoneClient.getInstance()

            assert.strictEqual(instance1, instance2)
        })

        it('should create new instance after dispose', () => {
            const instance1 = DataZoneClient.getInstance()
            DataZoneClient.dispose()
            const instance2 = DataZoneClient.getInstance()

            assert.notStrictEqual(instance1, instance2)
        })
    })

    describe('dispose', () => {
        it('should clear singleton instance', () => {
            const instance = DataZoneClient.getInstance()
            DataZoneClient.dispose()

            // Should create new instance after dispose
            const newInstance = DataZoneClient.getInstance()
            assert.notStrictEqual(instance, newInstance)
        })
    })

    describe('getDomainId', () => {
        it('should return default domain ID', () => {
            const testDomainId = 'test-domain-123'
            require('../../../../sagemakerunifiedstudio/shared/client/datazoneClient').setDefaultDatazoneDomainId(
                testDomainId
            )

            const result = dataZoneClient.getDomainId()
            assert.strictEqual(result, testDomainId)

            // Clean up
            require('../../../../sagemakerunifiedstudio/shared/client/datazoneClient').resetDefaultDatazoneDomainId()
        })
    })

    describe('getRegion', () => {
        it('should return configured region', () => {
            const result = dataZoneClient.getRegion()
            assert.strictEqual(typeof result, 'string')
            assert.ok(result.length > 0)
        })
    })

    describe('getSsoInstanceInfo', () => {
        it('should extract SSO instance info from DataZone login response', async () => {
            // Mock the HTTP call but test the response parsing logic
            const mockLoginResponse = {
                redirectUrl:
                    'https://identitycenter.amazonaws.com/authorize?client_id=arn%3Aaws%3Asso%3A%3A123456789%3Aapplication%2Fssoins-testInstanceId%2Fapl-testAppId&response_type=code&redirect_uri=https%3A%2F%2Fdzd_domainId.sagemaker.us-east-2.on.aws%2Fsso%2Fcallback&state=1234',
            }

            const callDataZoneLoginStub = sinon.stub(dataZoneClient as any, 'callDataZoneLogin')
            callDataZoneLoginStub.resolves(mockLoginResponse)

            try {
                const result = await dataZoneClient.getSsoInstanceInfo(testDomainUrl)

                assert.strictEqual(result.ssoInstanceId, 'ssoins-testInstanceId')
                assert.strictEqual(result.issuerUrl, 'https://identitycenter.amazonaws.com/ssoins-testInstanceId')
                assert.strictEqual(
                    result.clientId,
                    'arn:aws:sso::123456789:application/ssoins-testInstanceId/apl-testAppId'
                )
                assert.strictEqual(result.region, testRegion)
            } finally {
                callDataZoneLoginStub.restore()
            }
        })

        it('should throw an error for invalid domain URL', async () => {
            const invalidUrl = 'https://invalid-domain.com'

            await assert.rejects(
                async () => await dataZoneClient.getSsoInstanceInfo(invalidUrl),
                (err: ToolkitError) => err.code === 'InvalidDomainUrl'
            )
        })

        it('should throw an error when DataZone login fails', async () => {
            const callDataZoneLoginStub = sinon.stub(dataZoneClient as any, 'callDataZoneLogin')
            callDataZoneLoginStub.rejects(
                new ToolkitError('DataZone login failed: 500 Internal Server Error', { code: 'DataZoneLoginFailed' })
            )

            try {
                await assert.rejects(
                    async () => await dataZoneClient.getSsoInstanceInfo(testDomainUrl),
                    (err: ToolkitError) => err.code === 'DataZoneLoginFailed'
                )
            } finally {
                callDataZoneLoginStub.restore()
            }
        })

        it('should throw an error when redirect URL is missing', async () => {
            const callDataZoneLoginStub = sinon.stub(dataZoneClient as any, 'callDataZoneLogin')
            callDataZoneLoginStub.resolves({}) // Empty response without redirectUrl

            try {
                await assert.rejects(
                    async () => await dataZoneClient.getSsoInstanceInfo(testDomainUrl),
                    (err: ToolkitError) => err.code === 'InvalidLoginResponse'
                )
            } finally {
                callDataZoneLoginStub.restore()
            }
        })

        it('should throw an error when client_id is missing from redirect URL', async () => {
            const callDataZoneLoginStub = sinon.stub(dataZoneClient as any, 'callDataZoneLogin')
            callDataZoneLoginStub.resolves({
                redirectUrl:
                    'https://identitycenter.amazonaws.com/authorize?response_type=code&redirect_uri=https%3A%2F%2Fdzd_domainId.sagemaker.us-east-2.on.aws%2Fsso%2Fcallback&state=1234',
            })

            try {
                await assert.rejects(
                    async () => await dataZoneClient.getSsoInstanceInfo(testDomainUrl),
                    (err: ToolkitError) => err.code === 'InvalidRedirectUrl'
                )
            } finally {
                callDataZoneLoginStub.restore()
            }
        })

        it('should throw an error when client_id ARN format is invalid', async () => {
            const callDataZoneLoginStub = sinon.stub(dataZoneClient as any, 'callDataZoneLogin')
            callDataZoneLoginStub.resolves({
                redirectUrl:
                    'https://identitycenter.amazonaws.com/authorize?client_id=invalid-arn&response_type=code&redirect_uri=https%3A%2F%2Fdzd_domainId.sagemaker.us-east-2.on.aws%2Fsso%2Fcallback&state=1234',
            })

            try {
                await assert.rejects(
                    async () => await dataZoneClient.getSsoInstanceInfo(testDomainUrl),
                    (err: ToolkitError) => err.code === 'InvalidArnFormat'
                )
            } finally {
                callDataZoneLoginStub.restore()
            }
        })
    })

    describe('extractDomainIdFromUrl', () => {
        it('should extract domain ID from valid URL', () => {
            const result = (dataZoneClient as any).extractDomainIdFromUrl(testDomainUrl)
            assert.strictEqual(result, testDomainIdLowercase)
        })

        it('should return undefined for invalid URL', () => {
            const result = (dataZoneClient as any).extractDomainIdFromUrl('invalid-url')
            assert.strictEqual(result, undefined)
        })
    })

    describe('extractRegionFromUrl', () => {
        it('should extract region from valid URL', () => {
            const result = (dataZoneClient as any).extractRegionFromUrl(testDomainUrl)
            assert.strictEqual(result, testRegion)
        })

        it('should return default region for invalid URL', () => {
            const result = (dataZoneClient as any).extractRegionFromUrl('invalid-url')
            // Should return the default region configured for the client instance
            assert.strictEqual(result, 'us-east-1')
        })
    })

    describe('validateDomainUrl', () => {
        it('should return undefined for valid URL', () => {
            const result = dataZoneClient.validateDomainUrl(testDomainUrl)
            assert.strictEqual(result, undefined)
        })

        it('should return error for empty URL', () => {
            const result = dataZoneClient.validateDomainUrl('')
            assert.strictEqual(result, 'Domain URL is required')
        })

        it('should return error for whitespace-only URL', () => {
            const result = dataZoneClient.validateDomainUrl('   ')
            assert.strictEqual(result, 'Domain URL is required')
        })

        it('should return error for non-HTTPS URL', () => {
            const result = dataZoneClient.validateDomainUrl('http://dzd_test.sagemaker.us-east-1.on.aws')
            assert.strictEqual(result, 'Domain URL must use HTTPS (https://)')
        })

        it('should return error for non-SageMaker domain', () => {
            const result = dataZoneClient.validateDomainUrl('https://example.com')
            assert.strictEqual(
                result,
                'URL must be a valid SageMaker Unified Studio domain (e.g., https://dzd_xxxxxxxxx.sagemaker.us-east-1.on.aws)'
            )
        })

        it('should return error for URL without domain ID', () => {
            const result = dataZoneClient.validateDomainUrl('https://invalid.sagemaker.us-east-1.on.aws')
            assert.strictEqual(result, 'URL must contain a valid domain ID (starting with dzd- or dzd_)')
        })

        it('should return error for invalid URL format', () => {
            const result = dataZoneClient.validateDomainUrl('not-a-url')
            assert.strictEqual(result, 'Domain URL must use HTTPS (https://)')
        })

        it('should handle URLs with dzd- prefix', () => {
            const urlWithDash = 'https://dzd-domainId.sagemaker.us-east-2.on.aws'
            const result = dataZoneClient.validateDomainUrl(urlWithDash)
            assert.strictEqual(result, undefined)
        })

        it('should handle URLs with dzd_ prefix', () => {
            const urlWithUnderscore = 'https://dzd_domainId.sagemaker.us-east-2.on.aws'
            const result = dataZoneClient.validateDomainUrl(urlWithUnderscore)
            assert.strictEqual(result, undefined)
        })

        it('should trim whitespace from URL', () => {
            const urlWithWhitespace = '  https://dzd_domainId.sagemaker.us-east-2.on.aws  '
            const result = dataZoneClient.validateDomainUrl(urlWithWhitespace)
            assert.strictEqual(result, undefined)
        })
    })

    describe('extractDomainInfoFromUrl', () => {
        it('should extract both domain ID and region', () => {
            const result = dataZoneClient.extractDomainInfoFromUrl(testDomainUrl)
            assert.strictEqual(result.domainId, testDomainIdLowercase)
            assert.strictEqual(result.region, testRegion)
        })

        it('should handle invalid URL gracefully', () => {
            const result = dataZoneClient.extractDomainInfoFromUrl('invalid-url')
            assert.strictEqual(result.domainId, undefined)
            assert.strictEqual(typeof result.region, 'string')
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
                domainId: testDomainId,
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

            const result = await dataZoneClient.listProjects({ domainId: testDomainId })

            assert.strictEqual(result.projects.length, 0)
            assert.strictEqual(result.nextToken, undefined)
        })

        it('should use default domain ID when not provided', async () => {
            const mockDataZone = {
                listProjects: sinon.stub().resolves({
                    items: [],
                    nextToken: undefined,
                }),
            }

            sinon.stub(dataZoneClient as any, 'getDataZoneClient').resolves(mockDataZone)
            sinon.stub(dataZoneClient, 'getDomainId').returns('default-domain')

            await dataZoneClient.listProjects()

            assert.ok(
                mockDataZone.listProjects.calledWith(
                    sinon.match({
                        domainIdentifier: 'default-domain',
                    })
                )
            )
        })

        it('should handle API errors', async () => {
            const error = new Error('API Error')
            sinon.stub(dataZoneClient as any, 'getDataZoneClient').rejects(error)

            await assert.rejects(() => dataZoneClient.listProjects({ domainId: testDomainId }), error)
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

            const result = await dataZoneClient.getProjectDefaultEnvironmentCreds(testDomainId, 'project-1')

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
                () => dataZoneClient.getProjectDefaultEnvironmentCreds(testDomainId, 'project-1'),
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
                () => dataZoneClient.getProjectDefaultEnvironmentCreds(testDomainId, 'project-1'),
                /Failed to find default Tooling environment/
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
