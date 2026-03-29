/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SagemakerSpace } from '../../../awsService/sagemaker/sagemakerSpace'
import { SagemakerClient, SagemakerSpaceApp } from '../../../shared/clients/sagemaker'
import sinon from 'sinon'

describe('SagemakerSpace', function () {
    let mockClient: sinon.SinonStubbedInstance<SagemakerClient>
    let mockSpaceApp: SagemakerSpaceApp

    beforeEach(function () {
        mockClient = sinon.createStubInstance(SagemakerClient)
        mockSpaceApp = {
            SpaceName: 'test-space',
            Status: 'InService',
            DomainId: 'test-domain',
            DomainSpaceKey: 'test-key',
            SpaceSettingsSummary: {
                AppType: 'JupyterLab',
                RemoteAccess: 'ENABLED',
            },
        }
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('updateSpaceAppStatus', function () {
        it('should correctly map DescribeSpace API response to SagemakerSpaceApp type', async function () {
            // Mock DescribeSpace response (uses full property names)
            const mockDescribeSpaceResponse = {
                SpaceName: 'updated-space',
                Status: 'InService',
                DomainId: 'test-domain',
                SpaceSettings: {
                    // Note: 'SpaceSettings' not 'SpaceSettingsSummary'
                    AppType: 'CodeEditor',
                    RemoteAccess: 'DISABLED',
                },
                OwnershipSettings: {
                    OwnerUserProfileName: 'test-user',
                },
                SpaceSharingSettings: {
                    SharingType: 'Private',
                },
                $metadata: { requestId: 'test-request-id' },
            }

            // Mock DescribeApp response
            const mockDescribeAppResponse = {
                AppName: 'test-app',
                Status: 'InService',
                ResourceSpec: {
                    InstanceType: 'ml.t3.medium',
                },
                $metadata: { requestId: 'test-request-id' },
            }

            mockClient.describeSpace.resolves(mockDescribeSpaceResponse)
            mockClient.describeApp.resolves(mockDescribeAppResponse)
            mockClient.listAppsForDomainMatchSpaceIgnoreCase.resolves(mockDescribeAppResponse)

            const space = new SagemakerSpace(mockClient as any, 'us-east-1', mockSpaceApp)
            const updateSpaceSpy = sinon.spy(space, 'updateSpace')

            await space.updateSpaceAppStatus()

            // Verify updateSpace was called with correctly mapped properties
            assert.ok(updateSpaceSpy.calledOnce)
            const updateSpaceArgs = updateSpaceSpy.getCall(0).args[0]

            // Verify property name mapping from DescribeSpace to SagemakerSpaceApp
            assert.strictEqual(updateSpaceArgs.SpaceSettingsSummary?.AppType, 'CodeEditor')
            assert.strictEqual(updateSpaceArgs.SpaceSettingsSummary?.RemoteAccess, 'DISABLED')
            assert.strictEqual(updateSpaceArgs.OwnershipSettingsSummary?.OwnerUserProfileName, 'test-user')
            assert.strictEqual(updateSpaceArgs.SpaceSharingSettingsSummary?.SharingType, 'Private')

            // Verify other properties are preserved
            assert.strictEqual(updateSpaceArgs.SpaceName, 'updated-space')
            assert.strictEqual(updateSpaceArgs.Status, 'InService')
            assert.strictEqual(updateSpaceArgs.DomainId, 'test-domain')
            assert.strictEqual(updateSpaceArgs.App, mockDescribeAppResponse)
            assert.strictEqual(updateSpaceArgs.DomainSpaceKey, 'test-key')

            // Verify original API property names are not present
            assert.ok(!('SpaceSettings' in updateSpaceArgs))
            assert.ok(!('OwnershipSettings' in updateSpaceArgs))
            assert.ok(!('SpaceSharingSettings' in updateSpaceArgs))
        })

        it('should handle missing optional properties gracefully', async function () {
            // Mock minimal DescribeSpace response
            const mockDescribeSpaceResponse = {
                SpaceName: 'minimal-space',
                Status: 'InService',
                DomainId: 'test-domain',
                $metadata: { requestId: 'test-request-id' },
                // No SpaceSettings, OwnershipSettings, or SpaceSharingSettings
            }

            const mockDescribeAppResponse = {
                AppName: 'test-app',
                Status: 'InService',
                $metadata: { requestId: 'test-request-id' },
            }
            mockClient.listAppsForDomainMatchSpaceIgnoreCase.resolves(mockDescribeAppResponse)
            mockClient.describeSpace.resolves(mockDescribeSpaceResponse)

            const space = new SagemakerSpace(mockClient as any, 'us-east-1', mockSpaceApp)
            const updateSpaceSpy = sinon.spy(space, 'updateSpace')

            await space.updateSpaceAppStatus()

            // Should not throw and should handle undefined properties
            assert.ok(updateSpaceSpy.calledOnce)
            const updateSpaceArgs = updateSpaceSpy.getCall(0).args[0]

            assert.strictEqual(updateSpaceArgs.SpaceName, 'minimal-space')
            assert.strictEqual(updateSpaceArgs.SpaceSettingsSummary, undefined)
            assert.strictEqual(updateSpaceArgs.OwnershipSettingsSummary, undefined)
            assert.strictEqual(updateSpaceArgs.SpaceSharingSettingsSummary, undefined)
        })

        it('should update app status using listAppsForDomainMatchSpaceIgnoreCase', async function () {
            const mockDescribeSpaceResponse = {
                SpaceName: 'test-space',
                Status: 'InService',
                DomainId: 'test-domain',
                $metadata: { requestId: 'test-request-id' },
            }

            const mockAppFromList = {
                AppName: 'listed-app',
                Status: 'InService',
                $metadata: { requestId: 'test-request-id' },
            }

            mockClient.describeSpace.resolves(mockDescribeSpaceResponse)
            mockClient.listAppsForDomainMatchSpaceIgnoreCase.resolves(mockAppFromList)

            // Create space without App.AppName
            const spaceWithoutAppName: SagemakerSpaceApp = {
                ...mockSpaceApp,
                App: undefined,
            }

            const space = new SagemakerSpace(mockClient as any, 'us-east-1', spaceWithoutAppName)
            await space.updateSpaceAppStatus()

            // Verify listAppsForDomainMatchSpaceIgnoreCase was called instead of describeApp
            assert.ok(mockClient.listAppsForDomainMatchSpaceIgnoreCase.calledOnce)
            assert.ok(mockClient.listAppsForDomainMatchSpaceIgnoreCase.calledWith('test-domain', 'test-space'))
            assert.ok(mockClient.describeApp.notCalled)
        })
    })
})
