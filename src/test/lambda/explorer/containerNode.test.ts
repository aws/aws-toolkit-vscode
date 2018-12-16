/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { ContainerNode } from '../../../lambda/explorer/containerNode'
import { NoFunctionsNode } from '../../../lambda/explorer/noFunctionsNode'

describe('ContainerNode', () => {

    const nodeLabel = 'myContainerNode'

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {

        const testNode = new ContainerNode(nodeLabel, [])

        assert.equal(testNode.label, nodeLabel)
        assert.equal(testNode.tooltip, nodeLabel)
    })

    // Validates minimum children number
    it('minimum children number', async () => {
        const testNode = new ContainerNode(nodeLabel, [])

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.equal(childNodes.length, 1)
        assert(childNodes[0] instanceof NoFunctionsNode)
    })

})
