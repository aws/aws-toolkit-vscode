/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AwsCdkExplorer } from '../../cdk/explorer/awsCdkExplorer'

describe('AwsCdkExplorer', () => {
    it('displays no nodes in empty workspace', async () => {
        const awsCdkExplorer = new AwsCdkExplorer()

        const treeNodesPromise = awsCdkExplorer.getChildren()

        assert(treeNodesPromise)
        const treeNodes = await treeNodesPromise
        assert(treeNodes)
        assert.strictEqual(treeNodes.length, 0)
    })
})
