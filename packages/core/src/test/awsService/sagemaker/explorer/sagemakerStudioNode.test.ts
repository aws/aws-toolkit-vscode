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
    SagemakerStudioNode,
    SelectedDomainUsers,
    SelectedDomainUsersByRegion,
} from '../../../../awsService/sagemaker/explorer/sagemakerStudioNode'
import { globals } from '../../../../shared'
import { DefaultStsClient } from '../../../../shared/clients/stsClient'
import { assertNodeListOnlyHasPlaceholderNode } from '../../../utilities/explorerNodeAssertions'
import assert from 'assert'

describe('sagemakerStudioNode', function () {
    let testNode: SagemakerStudioNode
    let client: SagemakerClient
    let fetchSpaceAppsAndDomainsStub: sinon.SinonStub<
        [domainId?: string | undefined, filterSmusDomains?: boolean | undefined],
        Promise<[Map<string, SagemakerSpaceApp>, Map<string, DescribeDomainResponse>]>
    >
    let getCallerIdentityStub: sinon.SinonStub<[], Promise<GetCallerIdentityResponse>>
    const testRegion = 'testRegion'
    const domainsMap: Map<string, DescribeDomainResponse> = new Map([
        ['domain1', { DomainId: 'domain1', DomainName: 'domainName1' }],
        ['domain2', { DomainId: 'domain2', DomainName: 'domainName2' }],
    ])
    const createSpaceAppsMap = (): Map<string, SagemakerSpaceApp> =>
        new Map([
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
        testNode = new SagemakerStudioNode(testRegion, client)
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
        const spaceApps = createSpaceAppsMap()
        fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([spaceApps, domainsMap]))
        getCallerIdentityStub.returns(Promise.resolve(iamUser))
        sinon
            .stub(vscode.workspace, 'getConfiguration')
            .returns(getConfigFalse as unknown as vscode.WorkspaceConfiguration)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, spaceApps.size, 'Unexpected child count')
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

    // These two cases differ only in which caller identity is returned, so drive them from a
    // table rather than duplicating the body.
    for (const { description, callerIdentity } of [
        { description: 'the IAM user', callerIdentity: () => iamUser },
        { description: 'the IAM assumed-role session name', callerIdentity: () => assumedRoleUser },
    ]) {
        it(`filters spaces owned by user profiles that match ${description}`, async function () {
            fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([createSpaceAppsMap(), domainsMap]))
            getCallerIdentityStub.returns(Promise.resolve(callerIdentity()))
            sinon
                .stub(vscode.workspace, 'getConfiguration')
                .returns(getConfigTrue as unknown as vscode.WorkspaceConfiguration)

            const childNodes = await testNode.getChildren()
            assert.strictEqual(childNodes.length, 1, 'Unexpected child count')
            assert.strictEqual(childNodes[0].label, 'name2 (Stopped)', 'Unexpected node label')
        })
    }

    describe('Identity Center callers', function () {
        let resolveStub: sinon.SinonStub

        beforeEach(function () {
            resolveStub = sinon.stub(SagemakerClient.prototype, 'resolveUserProfilesForSsoUser')
        })

        it('shows only spaces owned by the user profile bound to the Identity Center user', async function () {
            fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([createSpaceAppsMap(), domainsMap]))
            getCallerIdentityStub.returns(Promise.resolve(ssoUser))
            // domain2's user2-efgh profile carries SingleSignOnUserValue === 'user2'
            resolveStub.returns(Promise.resolve(new Map([['domain2', ['user2-efgh']]])))

            const childNodes = await testNode.getChildren()
            assert.strictEqual(childNodes.length, 1, 'Unexpected child count')
            assert.strictEqual(childNodes[0].label, 'name2 (Stopped)', 'Unexpected node label')
        })

        it('resolves the Identity Center user name from the assumed-role session ARN', async function () {
            const spaces = createSpaceAppsMap()
            spaces.set('domain2__name3', {
                SpaceName: 'name3',
                DomainId: 'domain2',
                OwnershipSettingsSummary: { OwnerUserProfileName: 'user2-efgh' },
                Status: 'InService',
                DomainSpaceKey: 'domain2__name3',
            })
            fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([spaces, domainsMap]))
            getCallerIdentityStub.returns(Promise.resolve(ssoUser))
            resolveStub.returns(Promise.resolve(new Map([['domain2', ['user2-efgh']]])))

            await testNode.getChildren()
            assert.ok(resolveStub.calledOnce, 'Expected SSO profile resolution to run exactly once')
            const [userProfilesByDomain, ssoUserValue] = resolveStub.firstCall.args
            assert.deepStrictEqual(
                [...userProfilesByDomain].map(([domainId, userProfileNames]) => [domainId, [...userProfileNames]]),
                [
                    ['domain1', ['user1-abcd']],
                    ['domain2', ['user2-efgh']],
                ],
                'Unexpected user profiles queried'
            )
            assert.strictEqual(ssoUserValue, 'user2', 'Unexpected IdC user name extracted from ARN')
        })

        it('fails closed and hides all spaces when the user profile cannot be resolved', async function () {
            fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([createSpaceAppsMap(), domainsMap]))
            getCallerIdentityStub.returns(Promise.resolve(ssoUser))
            resolveStub.returns(Promise.resolve(new Map()))

            const childNodes = await testNode.getChildren()
            assertNodeListOnlyHasPlaceholderNode(childNodes)
            assert.strictEqual(
                (childNodes[0] as unknown as { label: string }).label,
                SagemakerConstants.IdcUnresolvedProfileMessage,
                'Unresolved IdC profile should use its own placeholder message'
            )
        })

        it('keeps shared spaces and hides ownerless spaces that are not explicitly shared', async function () {
            const spaces = new Map<string, SagemakerSpaceApp>([
                [
                    'domain1__shared',
                    {
                        SpaceName: 'shared',
                        DomainId: 'domain1',
                        SpaceSharingSettingsSummary: { SharingType: 'Shared' },
                        Status: 'InService',
                        DomainSpaceKey: 'domain1__shared',
                    },
                ],
                [
                    'domain1__private',
                    {
                        SpaceName: 'private',
                        DomainId: 'domain1',
                        SpaceSharingSettingsSummary: { SharingType: 'Private' },
                        Status: 'InService',
                        DomainSpaceKey: 'domain1__private',
                    },
                ],
                [
                    'domain1__unknown',
                    {
                        SpaceName: 'unknown',
                        DomainId: 'domain1',
                        Status: 'InService',
                        DomainSpaceKey: 'domain1__unknown',
                    },
                ],
            ])
            fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([spaces, domainsMap]))
            getCallerIdentityStub.returns(Promise.resolve(ssoUser))

            const childNodes = await testNode.getChildren()

            assert.deepStrictEqual(
                childNodes.map((node) => node.label),
                ['shared (Stopped)']
            )
            assert.strictEqual(resolveStub.callCount, 0, 'Ownerless spaces must not trigger profile resolution')
        })

        it('does not let a cached filter selection widen beyond what the IdC user owns', async function () {
            await globals.globalState.update(SagemakerConstants.SelectedDomainUsersState, [
                [testRegion, [[ssoUser.Arn, ['domain1__user1-abcd', 'domain2__user2-efgh']]]],
            ])
            fetchSpaceAppsAndDomainsStub.returns(Promise.resolve([createSpaceAppsMap(), domainsMap]))
            getCallerIdentityStub.returns(Promise.resolve(ssoUser))
            resolveStub.returns(Promise.resolve(new Map([['domain2', ['user2-efgh']]])))

            const childNodes = await testNode.getChildren()
            assert.strictEqual(childNodes.length, 1, 'Cached selection must not resurrect unowned spaces')
            assert.strictEqual(childNodes[0].label, 'name2 (Stopped)', 'Unexpected node label')

            await globals.globalState.update(SagemakerConstants.SelectedDomainUsersState, [])
        })
    })

    /**
     * Installs hooks giving each test a fresh node and restoring the persisted
     * selected-domain-users state afterwards. Shared by the suites below, which would
     * otherwise declare identical setup.
     */
    function useFreshNodeWithPreservedSelectionState() {
        let originalState: Map<string, SelectedDomainUsers>

        beforeEach(async function () {
            testNode = new SagemakerStudioNode(testRegion, client)
            originalState = new Map(
                globals.globalState.get<SelectedDomainUsersByRegion>(SagemakerConstants.SelectedDomainUsersState, [])
            )
        })

        afterEach(async function () {
            await globals.globalState.update(SagemakerConstants.SelectedDomainUsersState, [...originalState])
        })
    }

    describe('getSelectedDomainUsers', function () {
        useFreshNodeWithPreservedSelectionState()

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
            testNode.spaceApps = createSpaceAppsMap()
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
        useFreshNodeWithPreservedSelectionState()

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
            testNode = new SagemakerStudioNode(testRegion, client)
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

        it('uses resolved Identity Center ownership when IAM filtering is disabled', async function () {
            testNode.callerIdentity = {
                Arn: 'arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_PermissionSet_abcd/user3',
            }

            testNode.spaceApps = new Map([
                ['domain1__space1', createSpaceApp('user3-aaa')],
                ['domain1__space2', createSpaceApp('other-user')],
            ])

            sinon.stub(vscode.workspace, 'getConfiguration').returns(getConfigFalse as any)
            const resolveStub = sinon
                .stub(client, 'resolveUserProfilesForSsoUser')
                .resolves(new Map([['domain1', ['user3-aaa']]]))

            const result = await testNode.getLocalSelectedDomainUsers()
            assert.deepStrictEqual(result, ['domain1__user3-aaa'], 'Should match only the resolved IdC user profile')
            assert.strictEqual(resolveStub.callCount, 1)
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
