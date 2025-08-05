/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import {
    StateMachineExecutionNode,
    StateMachineNode,
    StepFunctionsNode,
} from '../../../stepFunctions/explorer/stepFunctionsNodes'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import globals from '../../../shared/extensionGlobals'
import { StepFunctionsClient } from '../../../shared/clients/stepFunctions'
import { stub } from '../../utilities/stubber'
import { ExecutionStatus, StateMachineListItem, StateMachineType } from '@aws-sdk/client-sfn'

const regionCode = 'someregioncode'

describe('StepFunctionsNode', function () {
    function createStatesClient(...stateMachineNames: string[]) {
        const client = stub(StepFunctionsClient, { regionCode })
        client.listStateMachines.returns(
            asyncGenerator(
                stateMachineNames.map((name) => {
                    return {
                        name: name,
                        stateMachineArn: 'arn:aws:states:us-east-1:123412341234:stateMachine:' + name,
                        type: 'STANDARD',
                        creationDate: new globals.clock.Date(),
                    }
                })
            )
        )

        return client
    }

    it('returns placeholder node if no children are present', async function () {
        const node = new StepFunctionsNode(regionCode, createStatesClient())

        assertNodeListOnlyHasPlaceholderNode(await node.getChildren())
    })

    it('has StateMachineNode child nodes', async function () {
        const client = createStatesClient('stateMachine1', 'stateMachine2')
        const testNode = new StepFunctionsNode(regionCode, client)
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 2, 'Unexpected child count')

        for (const node of childNodes) {
            assert.ok(node instanceof StateMachineNode, 'Expected child node to be StateMachineNode')
            assert.strictEqual(
                node.contextValue,
                StateMachineNode.contextValue,
                'expected the node to have a State Machine contextValue'
            )
        }
    })

    it('sorts child nodes', async function () {
        const client = createStatesClient('c', 'a', 'b')
        const testNode = new StepFunctionsNode(regionCode, client)
        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map((node) => node.label)
        assert.deepStrictEqual(actualChildOrder, ['a', 'b', 'c'], 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createStatesClient('state-machine')
        client.listStateMachines.throws()
        const testNode = new StepFunctionsNode(regionCode, client)

        assertNodeListOnlyHasErrorNode(await testNode.getChildren())
    })
})

describe('StateMachineNode', function () {
    type ExecutionTestData = {
        name: string
        status: ExecutionStatus
        time: string
    }

    const testStateMachineArn = 'arn:aws:states:us-east-1:123412341234:stateMachine:TestStateMachine'

    const testStateMachineListItem: StateMachineListItem = {
        stateMachineArn: testStateMachineArn,
        name: 'TestStateMachine',
        type: StateMachineType.STANDARD,
        creationDate: new Date('2025-07-28T11:22:17.986000+12:00'),
    }

    /*
     * Given a list of execution details (name, status, and start time), return a
     * StateMachineNode containing mocked ExecutionListItem records as children.
     */
    function createStateMachineNodeWithExecutions(...executions: ExecutionTestData[]) {
        const client = stub(StepFunctionsClient, { regionCode })
        client.listExecutions.returns(
            asyncGenerator(
                executions.map((execution) => {
                    return {
                        executionArn: `arn:aws:states:us-east-1:123412341234:execution:TestStateMachine:${execution.name}`,
                        stateMachineArn: testStateMachineArn,
                        name: execution.name,
                        status: execution.status,
                        startDate: new Date(`2025-07-29T${execution.time}:17.986000`),
                        stopDate: new Date(`2025-07-30T${execution.time}:17.986000`),
                    }
                })
            )
        )

        return new StateMachineNode(new StepFunctionsNode(regionCode), regionCode, testStateMachineListItem, client)
    }

    it('returns placeholder node if no executions are present', async function () {
        const node = createStateMachineNodeWithExecutions()
        assertNodeListOnlyHasPlaceholderNode(await node.getChildren())
    })

    it('has StateMachineExecutionNode child nodes', async function () {
        const node = createStateMachineNodeWithExecutions(
            { name: 'bea3b400-4e7e-48d4-ab67-9de111fe929a', status: ExecutionStatus.SUCCEEDED, time: '10:03' },
            { name: '6ef3ed7e-8ce3-4b50-b1af-11a57dd96277', status: ExecutionStatus.SUCCEEDED, time: '10:02' },
            { name: '4007b51e-c573-46ab-8157-184452a04590', status: ExecutionStatus.SUCCEEDED, time: '10:01' }
        )
        const childNodes = await node.getChildren()
        assert.strictEqual(childNodes.length, 3, 'Unexpected child count')

        for (const node of childNodes) {
            assert.ok(node instanceof StateMachineExecutionNode, 'Expected child node to be StateMachineExecutionNode')
            assert.strictEqual(
                node.contextValue,
                StateMachineExecutionNode.contextValue,
                'expected the node to have a State Machine Execution contextValue'
            )
        }
    })

    it('sorts the executions with newest first', async function () {
        const node = createStateMachineNodeWithExecutions(
            { name: 'Execution-3', status: ExecutionStatus.SUCCEEDED, time: '10:02' },
            { name: 'Execution-2', status: ExecutionStatus.FAILED, time: '10:03' },
            { name: 'Execution-0', status: ExecutionStatus.RUNNING, time: '10:05' },
            { name: 'Execution-4', status: ExecutionStatus.SUCCEEDED, time: '10:01' },
            { name: 'Execution-1', status: ExecutionStatus.SUCCEEDED, time: '10:04' }
        )

        const childNodes = await node.getChildren()
        assert.equal(childNodes.length, 5)

        for (const [index, child] of childNodes.entries()) {
            assert.equal(child.label, `Execution-${index}`)
        }
    })

    it('shows the execution status as the icon', async function () {
        const node = createStateMachineNodeWithExecutions(
            { name: 'Execution-Succeeded', status: ExecutionStatus.SUCCEEDED, time: '10:05' },
            { name: 'Execution-Running', status: ExecutionStatus.RUNNING, time: '10:04' },
            { name: 'Execution-Failed', status: ExecutionStatus.FAILED, time: '10:03' },
            { name: 'Execution-Aborted', status: ExecutionStatus.ABORTED, time: '10:02' },
            { name: 'Execution-TimedOut', status: ExecutionStatus.TIMED_OUT, time: '10:01' }
        )

        const childNodes = await node.getChildren()
        assert.equal(childNodes.length, 5)

        /* these are VS Code codicons */
        const expectedIcons = ['check', 'sync', 'error', 'error', 'error']
        for (const [index, child] of childNodes.entries()) {
            assert.equal(child.iconPath?.toString(), `$(${expectedIcons[index]})`)
        }
    })

    it('shows execution detail in the tooltip', async function () {
        const node = createStateMachineNodeWithExecutions(
            { name: 'Execution-Succeeded', status: ExecutionStatus.SUCCEEDED, time: '11:05' },
            { name: 'Execution-Running', status: ExecutionStatus.RUNNING, time: '10:04' },
            { name: 'Execution-Failed', status: ExecutionStatus.FAILED, time: '09:03' }
        )

        const childNodes = await node.getChildren()
        assert.equal(childNodes.length, 3)

        const startTimeText = localize('AWS.explorerNode.stepfunctions.startTime', 'Start Time')
        const endTimeText = localize('AWS.explorerNode.stepfunctions.endTime', 'End Time')
        const durationText = localize('AWS.explorerNode.stepfunctions.duration', 'Duration')
        const secondsText = localize('AWS.explorerNode.stepfunctions.seconds', 'seconds')

        /* Dates/times can be localized, so avoid matching against them */
        const expectedTooltips = [
            new RegExp(
                `^SUCCEEDED[\r\n]${startTimeText}: .*[\r\n]${endTimeText}: .*[\r\n]${durationText}: 86400 ${secondsText}[\r\n]$`
            ),
            new RegExp(`^RUNNING[\r\n]${startTimeText}: .*[\r\n]$`),
            new RegExp(
                `^FAILED[\r\n]${startTimeText}: .*[\r\n]${endTimeText}: .*[\r\n]${durationText}: 86400 ${secondsText}[\r\n]$`
            ),
        ]
        for (const [index, child] of childNodes.entries()) {
            assert.match(child.tooltip as string, expectedTooltips[index])
        }
    })
})
