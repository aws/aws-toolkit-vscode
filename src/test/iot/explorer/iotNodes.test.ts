/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { instance, mock } from '../../utilities/mockito'

describe('IotNode', function () {
    let iot: IotClient

    beforeEach(function () {
        iot = mock()
    })

    it('gets children', async function () {
        const node = new IotNode(instance(iot))
        const [thingFolder, certFolder, policyFolder] = await node.getChildren()

        assert.strictEqual(thingFolder, node.thingFolderNode)
        assert.strictEqual(certFolder, node.certFolderNode)
        assert.strictEqual(policyFolder, node.policyFolderNode)
    })
})
