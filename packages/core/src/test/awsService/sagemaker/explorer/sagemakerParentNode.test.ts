/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { DescribeDomainResponse } from '@amzn/sagemaker-client'
import { GetCallerIdentityResponse } from 'aws-sdk/clients/sts'
import { SagemakerClient, SagemakerSpaceApp } from '../../../../shared/clients/sagemaker'
import { SagemakerConstants } from '../../../../awsService/sagemaker/explorer/constants'
import {
    SagemakerParentNode,
    SelectedDomainUsers,
    SelectedDomainUsersByRegion,
} from '../../../../awsService/sagemaker/explorer/sagemakerParentNode'
import { globals } from '../../../../shared'
import { DefaultStsClient } from '../../../../shared/clients/stsClient'
import { assertNodeListOnlyHasPlaceholderNode } from '../../../utilities/explorerNodeAssertions'
import assert from 'assert'

describe('sagemakerParentNode', function () {
    let testNode: SagemakerParentNode
    let client: SagemakerClient
    let fetchSpaceAppsAndDomainsStub: sinon.SinonStub<
        [],
        Promise<[Map<string, SagemakerSpaceApp>, Map<string, DescribeDomainResponse>]>
    >
    let getCallerIdentityStub: sinon.SinonStub<[], Promise<GetCallerIdentityResponse>>
    const testRegion = 'testRegion'
    const domainsMap: Map<string, DescribeDomainResponse> = new Map([
        ['domain1', { DomainId: 'domain1', DomainName: 'domainName1' }],
        ['domain2', { DomainId: 'domain2', DomainName: 'domainName2' }],
    ])
    const spaceAppsMap: Map<string, SagemakerSpaceApp> = new Map([
        [
            'domain1__name1',
            {
                SpaceName: 'name1',
                DomainId: 'domain1',
                OwnershipSettingsSummary: { OwnerUserProfileName: 'user1-abcd' },
                Status: 'InService',
                DomainSpaceKey: 'domain1__name1',
            },
        ],
        [
            'domain2__name2',
            {
                SpaceName: 'name2',
                DomainId: 'domain2',
                OwnershipSettingsSummary: { OwnerUserProfileName: 'user2-efgh' },
                Status: 'InService',
                DomainSpaceKey: 'domain2__name2',
            },
        ],
    ])
    const spaceAppsMapPending: Map<string, SagemakerSpaceApp> = new Map([
        [
            'domain1__name3',
            {
                SpaceName: 'name3',
                DomainId: 'domain1',
                OwnershipSettingsSummary: { OwnerUserProfileName: 'user1-abcd' },
                Status: 'InService',
                DomainSpaceKey: 'domain1__name3',
                App: {
                    Status: 'InService',
                },
            },
        ],
        [
            'domain2__name4',
            {
                SpaceName: 'name4',
                DomainId: 'domain2',
                OwnershipSettingsSummary: { OwnerUserProfileName: 'user2-efgh' },
                Status: 'InService',
                DomainSpaceKey: 'domain2__name4',
                App: {
                    Status: 'Pending',
                },
            },
        ],
    ])
    const iamUser = {
        UserId: 'test-userId',
        Account: '123456789012',
        Arn: 'arn:aws:iam::123456789012:user/user2',
    }
    const assumedRoleUser = {
        UserId: 'test-userId',
        Account: '123456789012',
        Arn: 'arn:aws:sts::123456789012:assumed-role/UserRole/user2',
    }
    const ssoUser = {
        UserId: 'test-userId',
        Account: '123456789012',
        Arn: 'arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_MyPermissionSet_abcd1234/user2',
    }
    const getConfigTrue = {
        get: () => true,
    }
    const getConfigFalse = {
        get: () => false,
    }

    before(function () {
        client = new SagemakerClient(testRegion)
    })

    beforeEach(function () {
        fetchSpaceAppsAndDomainsStub = sinon.stub(SagemakerClient.prototype, 'fetchSpaceAppsAndDomains')
        getCallerIdentityStub = sinon.stub(DefaultStsClient.prototype, 'getCallerIdentity')
        testNode = new SagemakerParentNode(testRegion, client)
    })

    afterEach(function () {
        fetchSpaceAppsAndDomainsStub.restore()
        getCallerIdentityStub.restore()
        testNode.pollingSet.clear()
        testNode.pollingSet.clearTimer()
        sinon.restore()
    })

    it('returns placeholder node if no children are present', async function () {
        fetchSpaceAppsAndDomainsStub.returns(
            Promise.resolve([new Map<string, SagemakerSpaceApp>(), new Map<string, DescribeDomainResponse>()])
        )
        getCallerIdentityStub.returns(Promise.resolve(iamUser))

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has child nodes', async function () {
        fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([spaceAppsMap, domainsMap]))
        getCallerIdentityStub.returns(Promise.resolve(iamUser))
        sinon
            .stub(vscode.workspace, 'getConfiguration')
            .returns(getConfigFalse as unknown as vscode.WorkspaceConfiguration)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, spaceAppsMap.size, 'Unexpected child count')
        assert.strictEqual(childNodes[0].label, 'name1 (Stopped)', 'Unexpected node label')
        assert.strictEqual(childNodes[1].label, 'name2 (Stopped)', 'Unexpected node label')
    })

    it('adds pending nodes to polling nodes set', async function () {
        fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([spaceAppsMapPending, domainsMap]))
        getCallerIdentityStub.returns(Promise.resolve(iamUser))

        await testNode.updateChildren()
        assert.strictEqual(testNode.pollingSet.size, 1)
        fetchSpaceAppsAndDomainsStub.restore()
    })

    it('filters spaces owned by user profiles that match the IAM user', async function () {
        fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([spaceAppsMap, domainsMap]))
        getCallerIdentityStub.returns(Promise.resolve(iamUser))
        sinon
            .stub(vscode.workspace, 'getConfiguration')
            .returns(getConfigTrue as unknown as vscode.WorkspaceConfiguration)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1, 'Unexpected child count')
        assert.strictEqual(childNodes[0].label, 'name2 (Stopped)', 'Unexpected node label')
    })

    it('filters spaces owned by user profiles that match the IAM assumed-role session name', async function () {
        fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([spaceAppsMap, domainsMap]))
        getCallerIdentityStub.returns(Promise.resolve(assumedRoleUser))
        sinon
            .stub(vscode.workspace, 'getConfiguration')
            .returns(getConfigTrue as unknown as vscode.WorkspaceConfiguration)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1, 'Unexpected child count')
        assert.strictEqual(childNodes[0].label, 'name2 (Stopped)', 'Unexpected node label')
    })

    it('filters spaces owned by user profiles that match the Identity Center user', async function () {
        fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([spaceAppsMap, domainsMap]))
        getCallerIdentityStub.returns(Promise.resolve(ssoUser))
        sinon
            .stub(vscode.workspace, 'getConfiguration')
            .returns(getConfigFalse as unknown as vscode.WorkspaceConfiguration)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1, 'Unexpected child count')
        assert.strictEqual(childNodes[0].label, 'name2 (Stopped)', 'Unexpected node label')
    })

    describe('getSelectedDomainUsers', function () {
        let originalState: Map<string, SelectedDomainUsers>

        beforeEach(async function () {
            testNode = new SagemakerParentNode(testRegion, client)
            originalState = new Map(
                globals.globalState.get<SelectedDomainUsersByRegion>(SagemakerConstants.SelectedDomainUsersState, [])
            )
        })

        afterEach(async function () {
            await globals.globalState.update(SagemakerConstants.SelectedDomainUsersState, [...originalState])
        })

        it('gets cached selectedDomainUsers for a given region', async function () {
            await globals.globalState.update(SagemakerConstants.SelectedDomainUsersState, [
                [testRegion, [['arn:aws:iam::123456789012:user/user2', ['domain2__user-cached']]]],
            ])
            testNode.callerIdentity = iamUser
            sinon
                .stub(vscode.workspace, 'getConfiguration')
                .returns(getConfigTrue as unknown as vscode.WorkspaceConfiguration)

            const result = await testNode.getSelectedDomainUsers()
            assert.deepStrictEqual(
                [...result],
                ['domain2__user-cached'],
                'Should match only cached selected domain user'
            )
        })

        it('gets default selectedDomainUsers', async function () {
            await globals.globalState.update(SagemakerConstants.SelectedDomainUsersState, [])
            testNode.spaceApps = spaceAppsMap
            testNode.callerIdentity = iamUser
            sinon
                .stub(vscode.workspace, 'getConfiguration')
                .returns(getConfigTrue as unknown as vscode.WorkspaceConfiguration)

            const result = await testNode.getSelectedDomainUsers()
            assert.deepStrictEqual(
                [...result],
                ['domain2__user2-efgh'],
                'Should match only default selected domain user'
            )
        })
    })

    describe('saveSelectedDomainUsers', function () {
        let originalState: Map<string, SelectedDomainUsers>

        beforeEach(async function () {
            testNode = new SagemakerParentNode(testRegion, client)
            originalState = new Map(
                globals.globalState.get<SelectedDomainUsersByRegion>(SagemakerConstants.SelectedDomainUsersState, [])
            )
        })

        afterEach(async function () {
            await globals.globalState.update(SagemakerConstants.SelectedDomainUsersState, [...originalState])
        })

        it('saves selectedDomainUsers for a given region', async function () {
            testNode.callerIdentity = iamUser
            testNode.saveSelectedDomainUsers(['domain1__user-1', 'domain2__user-2'])

            const selectedDomainUsersByRegionMap = new Map(
                globals.globalState.get<SelectedDomainUsersByRegion>(SagemakerConstants.SelectedDomainUsersState, [])
            )
            const selectedDomainUsers = new Map(selectedDomainUsersByRegionMap.get(testRegion))

            assert.deepStrictEqual(selectedDomainUsers.get(iamUser.Arn), ['domain1__user-1', 'domain2__user-2'])
        })
    })

    describe('getLocalSelectedDomainUsers', function () {
        const createSpaceApp = (ownerName: string): SagemakerSpaceApp => ({
            SpaceName: 'space1',
            DomainId: 'domain1',
            Status: 'InService',
            OwnershipSettingsSummary: {
                OwnerUserProfileName: ownerName,
            },
            DomainSpaceKey: 'domain1__name1',
        })

        beforeEach(function () {
            testNode = new SagemakerParentNode(testRegion, client)
        })

        it('matches IAM user ARN when filtering is enabled', async function () {
            testNode.callerIdentity = {
                Arn: 'arn:aws:iam::123456789012:user/user1',
            }

            testNode.spaceApps = new Map([
                ['domain1__space1', createSpaceApp('user1-abc')],
                ['domain1__space2', createSpaceApp('user2-xyz')],
            ])

            sinon.stub(vscode.workspace, 'getConfiguration').returns(getConfigTrue as any)

            const result = await testNode.getLocalSelectedDomainUsers()
            assert.deepStrictEqual(result, ['domain1__user1-abc'], 'Should match only user1-prefixed space')
        })

        it('matches IAM assumed-role ARN when filtering is enabled', async function () {
            testNode.callerIdentity = {
                Arn: 'arn:aws:sts::123456789012:assumed-role/SomeRole/user2',
            }

            testNode.spaceApps = new Map([
                ['domain1__space1', createSpaceApp('user2-xyz')],
                ['domain1__space2', createSpaceApp('user3-def')],
            ])

            sinon.stub(vscode.workspace, 'getConfiguration').returns(getConfigTrue as any)

            const result = await testNode.getLocalSelectedDomainUsers()
            assert.deepStrictEqual(result, ['domain1__user2-xyz'], 'Should match only user2-prefixed space')
        })

        it('matches Identity Center ARN when IAM filtering is disabled', async function () {
            testNode.callerIdentity = {
                Arn: 'arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_PermissionSet_abcd/user3',
            }

            testNode.spaceApps = new Map([
                ['domain1__space1', createSpaceApp('user3-aaa')],
                ['domain1__space2', createSpaceApp('other-user')],
            ])

            sinon.stub(vscode.workspace, 'getConfiguration').returns(getConfigFalse as any)

            const result = await testNode.getLocalSelectedDomainUsers()
            assert.deepStrictEqual(result, ['domain1__user3-aaa'], 'Should match only user3-prefixed space')
        })

        it('returns empty array if no match is found', async function () {
            testNode.callerIdentity = {
                Arn: 'arn:aws:iam::123456789012:user/no-match',
            }

            testNode.spaceApps = new Map([['domain1__space1', createSpaceApp('someone-else')]])

            sinon.stub(vscode.workspace, 'getConfiguration').returns(getConfigTrue as any)

            const result = await testNode.getLocalSelectedDomainUsers()
            assert.deepStrictEqual(result, [], 'Should return empty list when no prefix matches')
        })
    })
})
