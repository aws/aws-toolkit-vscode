/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { Ec2Prompter, instanceFilter } from '../../../awsService/ec2/prompter'
import { SafeEc2Instance } from '../../../shared/clients/ec2Client'
import { RegionSubmenuResponse } from '../../../shared/ui/common/regionSubmenu'
import { Ec2Selection } from '../../../awsService/ec2/prompter'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'

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

        protected override async getInstancesFromRegion(regionCode: string): Promise<AsyncCollection<SafeEc2Instance>> {
            return intoCollection(this.instances)
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

        before(function () {
            prompter = new MockEc2Prompter()
        })

        it('returns QuickPickItem for named instances', function () {
            const testInstance = {
                Name: 'testName',
                InstanceId: 'testInstanceId',
                LastSeenStatus: 'running',
            }

            const result = prompter.testAsQuickPickItem(testInstance)
            const expected = {
                label: Ec2Prompter.getLabel(testInstance),
                detail: testInstance.InstanceId,
                data: testInstance.InstanceId,
            }
            assert.deepStrictEqual(result, expected)
        })

        it('returns QuickPickItem for non-named instances', function () {
            const testInstance = {
                InstanceId: 'testInstanceId',
                LastSeenStatus: 'running',
            }

            const result = prompter.testAsQuickPickItem(testInstance)
            const expected = {
                label: Ec2Prompter.getLabel(testInstance),
                detail: testInstance.InstanceId,
                data: testInstance.InstanceId,
            }

            assert.deepStrictEqual(result, expected)
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
})
