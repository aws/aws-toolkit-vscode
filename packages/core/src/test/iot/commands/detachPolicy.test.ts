/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { detachPolicyCommand } from '../../../iot/commands/detachPolicy'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { IotPolicyCertNode } from '../../../iot/explorer/iotPolicyNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { IotNode } from '../../../iot/explorer/iotNodes'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'
import sinon from 'sinon'
import assert from 'assert'

describe('detachPolicyCommand', function () {
    const policyName = 'test-policy'
    const target = 'cert:arn'
    let iot: IotClient
    let node: IotPolicyCertNode
    let parentNode: IotCertWithPoliciesNode

    beforeEach(function () {
        iot = {} as any as IotClient
        parentNode = new IotCertWithPoliciesNode(
            { id: 'id', arn: target, activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
            new IotCertsFolderNode(iot, new IotNode(iot)),
            iot
        )
        node = new IotPolicyCertNode({ name: policyName, arn: 'arn' }, parentNode, iot)
    })

    it('confirms detach, detaches policy, and refreshes node', async function () {
        const stub = sinon.stub()
        iot.detachPolicy = stub
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        await detachPolicyCommand(node)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to detach policy test-policy?')

        assert(stub.calledOnceWithExactly({ policyName, target }))
    })

    it('does nothing when cancelled', async function () {
        const stub = sinon.stub()
        iot.detachPolicy = stub
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await detachPolicyCommand(node)

        assert(stub.notCalled)
    })

    it('shows an error message and refreshes node when thing detachment fails', async function () {
        const stub = sinon.stub().rejects()
        iot.detachPolicy = stub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        await detachPolicyCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to detach: test-policy/)
    })
})
