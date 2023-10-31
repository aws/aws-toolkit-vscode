/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPolicyVersionCommand } from '../../../iot/commands/createPolicyVersion'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { getTestWindow } from '../../shared/vscode/window'

describe('createPolicyVersionCommand', function () {
    const policyName = 'test-policy'

    let iot: IotClient
    let policyObject: any
    let policyDocument: string
    let node: IotPolicyWithVersionsNode
    let parentNode: IotPolicyFolderNode
    let returnUndefined: boolean = false
    const getPolicy: () => Promise<Buffer | undefined> = async () => {
        if (returnUndefined) {
            return undefined
        }
        return Buffer.from(policyDocument, 'utf-8')
    }

    beforeEach(function () {
        iot = mock()
        parentNode = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)))
        node = new IotPolicyWithVersionsNode({ name: policyName, arn: 'arn' }, parentNode, instance(iot))
        policyObject = { Version: '2012-10-17', Statement: '' }
        policyDocument = JSON.stringify(policyObject)
        returnUndefined = false
    })

    it('creates new policy version and shows success', async function () {
        returnUndefined = false
        await createPolicyVersionCommand(node, getPolicy)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created new version of test-policy/)

        verify(iot.createPolicyVersion(deepEqual({ policyName, policyDocument, setAsDefault: true }))).once()
    })

    it('does nothing when policy document is not read', async function () {
        returnUndefined = true
        await createPolicyVersionCommand(node, getPolicy)

        verify(iot.createPolicyVersion(anything())).never()
    })

    it('shows an error message when JSON is invalid', async function () {
        returnUndefined = false
        policyDocument = 'not a JSON'
        await createPolicyVersionCommand(node, getPolicy)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create new version of test-policy/)

        verify(iot.createPolicyVersion(anything())).never()
    })

    it('shows an error message if creating version fails', async function () {
        returnUndefined = false
        when(iot.createPolicyVersion(anything())).thenReject(new Error('Expected failure'))

        await createPolicyVersionCommand(node, getPolicy)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create new version of test-policy/)
    })
})
