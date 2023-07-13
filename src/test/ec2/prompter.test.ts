/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { Ec2Prompter } from '../../ec2/prompter'
import { Ec2Instance } from '../../shared/clients/ec2Client'
import { RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'
import { Ec2Selection } from '../../ec2/utils'

describe('Ec2Prompter', async function () {
    class MockEc2Prompter extends Ec2Prompter {
        public testAsQuickPickItem(testInstance: Ec2Instance) {
            return Ec2Prompter.asQuickPickItem(testInstance)
        }

        public testGetSelectionFromResponse(response: RegionSubmenuResponse<string>): Ec2Selection {
            return Ec2Prompter.getSelectionFromResponse(response)
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
                name: 'testName',
                InstanceId: 'testInstanceId',
            }

            const result = prompter.testAsQuickPickItem(testInstance)
            const expected = {
                label: '$(terminal) \t' + testInstance.name,
                detail: testInstance.InstanceId,
                data: testInstance.InstanceId,
            }
            assert.deepStrictEqual(result, expected)
        })

        it('returns QuickPickItem for non-named instances', function () {
            const testInstance = {
                InstanceId: 'testInstanceId',
            }

            const result = prompter.testAsQuickPickItem(testInstance)
            const expected = {
                label: '$(terminal) \t' + '(no name)',
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
})
