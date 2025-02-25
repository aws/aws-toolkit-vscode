/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2Prompter, getSelection, instanceFilter } from '../../../awsService/ec2/prompter'
import { SafeEc2Instance } from '../../../shared/clients/ec2'
import { RegionSubmenuResponse } from '../../../shared/ui/common/regionSubmenu'
import { Ec2Selection } from '../../../awsService/ec2/prompter'
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import { Ec2InstanceNode } from '../../../awsService/ec2/explorer/ec2InstanceNode'
import { testClient, testInstance, testParentNode } from './explorer/ec2ParentNode.test'

describe('Ec2Prompter', async function () {
    class MockEc2Prompter extends Ec2Prompter {
        public instances: SafeEc2Instance[] = []

        public testAsQuickPickItem(testInstance: SafeEc2Instance) {
            return Ec2Prompter.asQuickPickItem(testInstance)
        }

        public testGetSelectionFromResponse(response: RegionSubmenuResponse<string>): Ec2Selection {
            return Ec2Prompter.getSelectionFromResponse(response)
        }
        public async testGetInstancesAsQuickPickItems(region: string): Promise<DataQuickPickItem<string>[]> {
            return this.getInstancesAsQuickPickItems(region)
        }

        protected override async getInstancesFromRegion(_: string): Promise<SafeEc2Instance[]> {
            return this.instances
        }

        public setFilter(filter: instanceFilter) {
            this.filter = filter
        }

        public unsetFilter() {
            this.filter = undefined
        }
    }
    it('initializes properly', function () {
        const prompter = new Ec2Prompter()
        assert.ok(prompter)
    })

    describe('asQuickPickItem', async function () {
        let prompter: MockEc2Prompter

        const testQuickPick = (instance: SafeEc2Instance) => {
            const result = prompter.testAsQuickPickItem(testInstance)
            assert.deepStrictEqual(result, {
                label: Ec2Prompter.getLabel(testInstance),
                detail: testInstance.InstanceId,
                data: testInstance.InstanceId,
            })
        }

        before(function () {
            prompter = new MockEc2Prompter()
        })

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
        let prompter: MockEc2Prompter

        before(function () {
            prompter = new MockEc2Prompter()
        })

        it('returns correctly formatted Ec2Selection', function () {
            const testResponse: RegionSubmenuResponse<string> = {
                region: 'test-region',
                data: 'testInstance',
            }

            const result = prompter.testGetSelectionFromResponse(testResponse)
            const expected: Ec2Selection = {
                instanceId: testResponse.data,
                region: testResponse.region,
            }

            assert.deepStrictEqual(result, expected)
        })
    })

    describe('getInstancesAsQuickPickItem', async function () {
        let prompter: MockEc2Prompter

        before(function () {
            prompter = new MockEc2Prompter()
        })

        beforeEach(function () {
            prompter.instances = [
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
                {
                    InstanceId: '3',
                    Name: 'third',
                    LastSeenStatus: 'running',
                },
            ]
            prompter.unsetFilter()
        })

        it('returns empty when no instances present', async function () {
            prompter.instances = []
            const items = await prompter.testGetInstancesAsQuickPickItems('test-region')
            assert.ok(items.length === 0)
        })

        it('returns items mapped to QuickPick items without filter', async function () {
            const expected = [
                {
                    label: Ec2Prompter.getLabel(prompter.instances[0]),
                    detail: prompter.instances[0].InstanceId!,
                    data: prompter.instances[0].InstanceId!,
                },
                {
                    label: Ec2Prompter.getLabel(prompter.instances[1]),
                    detail: prompter.instances[1].InstanceId!,
                    data: prompter.instances[1].InstanceId!,
                },
                {
                    label: Ec2Prompter.getLabel(prompter.instances[2]),
                    detail: prompter.instances[2].InstanceId!,
                    data: prompter.instances[2].InstanceId!,
                },
            ]

            const items = await prompter.testGetInstancesAsQuickPickItems('test-region')
            assert.deepStrictEqual(items, expected)
        })

        it('applies filter when given', async function () {
            prompter.setFilter((i) => parseInt(i.InstanceId!) % 2 === 1)

            const expected = [
                {
                    label: Ec2Prompter.getLabel(prompter.instances[0]),
                    detail: prompter.instances[0].InstanceId!,
                    data: prompter.instances[0].InstanceId!,
                },
                {
                    label: Ec2Prompter.getLabel(prompter.instances[2]),
                    detail: prompter.instances[2].InstanceId!,
                    data: prompter.instances[2].InstanceId!,
                },
            ]

            const items = await prompter.testGetInstancesAsQuickPickItems('test-region')
            assert.deepStrictEqual(items, expected)
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
