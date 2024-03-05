/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'

describe('IotNode', function () {
    let iot: IotClient

    beforeEach(function () {
        iot = {} as any as IotClient
    })

    it('gets children', async function () {
        const node = new IotNode(iot)
        const [thingFolder, certFolder, policyFolder] = await node.getChildren()

        assert.strictEqual(thingFolder, node.thingFolderNode)
        assert.strictEqual(certFolder, node.certFolderNode)
        assert.strictEqual(policyFolder, node.policyFolderNode)
    })
})
