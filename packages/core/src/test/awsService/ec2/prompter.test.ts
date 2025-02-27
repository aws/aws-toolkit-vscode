/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2Prompter, getSelection } from '../../../awsService/ec2/prompter'
import { PatchedEc2Instance } from '../../../shared/clients/ec2'
import { RegionSubmenuResponse } from '../../../shared/ui/common/regionSubmenu'
import { Ec2Selection } from '../../../awsService/ec2/prompter'
import { Ec2InstanceNode } from '../../../awsService/ec2/explorer/ec2InstanceNode'
import { testClient, testInstance, testParentNode } from './explorer/ec2ParentNode.test'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import { getTestWindow } from '../../shared/vscode/window'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'

describe('Ec2Prompter', async function () {
    const defaultInstances: PatchedEc2Instance[][] = [
        [
            {
                InstanceId: '1',
                Name: 'first',
                LastSeenStatus: 'running',
            },
            {
                InstanceId: '2',
                Name: 'second',
                LastSeenStatus: 'running',
            },
        ],
        [
            {
                InstanceId: '3',
                Name: 'third',
                LastSeenStatus: 'running',
            },
        ],
    ]

    const defaultQuickPickItems: DataQuickPickItem<string>[] = [
        {
            label: Ec2Prompter.getLabel(defaultInstances[0][0]),
            detail: defaultInstances[0][0].InstanceId,
            data: defaultInstances[0][0].InstanceId,
        },
        {
            label: Ec2Prompter.getLabel(defaultInstances[0][1]),
            detail: defaultInstances[0][1].InstanceId,
            data: defaultInstances[0][1].InstanceId,
        },
        {
            label: Ec2Prompter.getLabel(defaultInstances[1][0]),
            detail: defaultInstances[1][0].InstanceId,
            data: defaultInstances[1][0].InstanceId,
        },
    ]
    const defaultGetInstances: (regionCode: string) => AsyncCollection<PatchedEc2Instance[]> = (_) =>
        intoCollection(defaultInstances)

    it('initializes properly', function () {
        const prompter = new Ec2Prompter()
        assert.ok(prompter)
    })

    it('does not show items, when no instances returned', async function () {
        const prompter = new Ec2Prompter({ getInstancesFromRegion: (_) => intoCollection([]) })
        getTestWindow().onDidShowQuickPick(async (qp) => {
            await qp.untilReady()
            assert.deepStrictEqual(qp.items.slice(3), [])
            qp.hide()
        })
        await assert.rejects(async () => await prompter.promptUser(), CancellationError)
    })

    it('shows all items when no filter', async function () {
        const prompter = new Ec2Prompter({ getInstancesFromRegion: defaultGetInstances })
        getTestWindow().onDidShowQuickPick(async (qp) => {
            await qp.untilReady()
            qp.assertContainsItems(...defaultQuickPickItems)
            qp.acceptItem(defaultQuickPickItems[0].label)
        })
        await prompter.promptUser()
    })

    it('shows filtered items when filter present', async function () {
        const prompter = new Ec2Prompter({
            getInstancesFromRegion: defaultGetInstances,
            instanceFilter: (i) => parseInt(i.InstanceId) % 2 === 1,
        })

        getTestWindow().onDidShowQuickPick(async (qp) => {
            await qp.untilReady()
            qp.assertContainsItems(defaultQuickPickItems[0], defaultQuickPickItems[2])
            qp.acceptItem(defaultQuickPickItems[0].label)
        })
        await prompter.promptUser()
    })

    describe('asQuickPickItem', async function () {
        const testQuickPick = (instance: PatchedEc2Instance) => {
            assert.deepStrictEqual(Ec2Prompter.asQuickPickItem(instance), {
                label: Ec2Prompter.getLabel(instance),
                detail: instance.InstanceId,
                data: instance.InstanceId,
            })
        }

        it('returns QuickPickItem for named instances', function () {
            testQuickPick({
                Name: 'testName',
                InstanceId: 'testInstanceId',
                LastSeenStatus: 'running',
            })
        })

        it('returns QuickPickItem for non-named instances', function () {
            testQuickPick({
                InstanceId: 'testInstanceId',
                LastSeenStatus: 'running',
            })
        })
    })

    describe('handleEc2ConnectPrompterResponse', function () {
        it('returns correctly formatted Ec2Selection', function () {
            const testResponse: RegionSubmenuResponse<string> = {
                region: 'test-region',
                data: 'testInstance',
            }

            const result = Ec2Prompter.getSelectionFromResponse(testResponse)
            const expected: Ec2Selection = {
                instanceId: testResponse.data,
                region: testResponse.region,
            }

            assert.deepStrictEqual(result, expected)
        })
    })

    describe('getSelection', async function () {
        it('uses node when passed', async function () {
            const prompterStub = sinon.stub(Ec2Prompter.prototype, 'promptUser')
            const testNode = new Ec2InstanceNode(
                testParentNode,
                testClient,
                'testRegion',
                'testPartition',
                testInstance
            )
            const result = await getSelection(testNode)

            assert.strictEqual(result.instanceId, testNode.toSelection().instanceId)
            assert.strictEqual(result.region, testNode.toSelection().region)
            sinon.assert.notCalled(prompterStub)
            prompterStub.restore()
        })

        it('prompts user when no node is passed', async function () {
            const prompterStub = sinon.stub(Ec2Prompter.prototype, 'promptUser')
            await getSelection()
            sinon.assert.calledOnce(prompterStub)
            prompterStub.restore()
        })
    })
})
