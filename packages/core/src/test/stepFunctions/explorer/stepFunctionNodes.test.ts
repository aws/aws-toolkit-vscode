/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    contextValueStateMachine,
    StateMachineNode,
    StepFunctionsNode,
} from '../../../stepFunctions/explorer/stepFunctionsNodes'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import globals from '../../../shared/extensionGlobals'
import { DefaultStepFunctionsClient } from '../../../shared/clients/stepFunctionsClient'
import { stub } from '../../utilities/stubber'

const regionCode = 'someregioncode'

describe('StepFunctionsNode', function () {
    function createStatesClient(...stateMachineNames: string[]) {
        const client = stub(DefaultStepFunctionsClient, { regionCode })
        client.listStateMachines.returns(
            asyncGenerator(
                stateMachineNames.map(name => {
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

        childNodes.forEach(node => {
            assert.ok(node instanceof StateMachineNode, 'Expected child node to be StateMachineNode')
            assert.strictEqual(
                node.contextValue,
                contextValueStateMachine,
                'expected the node to have a State Machine contextValue'
            )
        })
    })

    it('sorts child nodes', async function () {
        const client = createStatesClient('c', 'a', 'b')
        const testNode = new StepFunctionsNode(regionCode, client)
        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, ['a', 'b', 'c'], 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createStatesClient('state-machine')
        client.listStateMachines.throws()
        const testNode = new StepFunctionsNode(regionCode, client)

        assertNodeListOnlyHasErrorNode(await testNode.getChildren())
    })
})
