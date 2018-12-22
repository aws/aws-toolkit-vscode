/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { GenericNode } from '../../../lambda/explorer/genericNode'
import { PlaceholderNode } from '../../../lambda/explorer/placeholderNode'

describe('GenericNode', () => {

    const nodeLabel = 'myGenericNode'

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {

        const testNode = new GenericNode(undefined, nodeLabel)

        assert.equal(testNode.label, nodeLabel)
        assert.equal(testNode.tooltip, nodeLabel)
    })

    // Validates minimum children number
    it('minimum children number', async () => {
        const testNode = new GenericNode(undefined, nodeLabel)

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.equal(childNodes.length, 1)
        assert(childNodes[0] instanceof PlaceholderNode)
    })

})
