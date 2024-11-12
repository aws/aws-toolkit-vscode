/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { assertTelemetry } from '../../testUtil'
import { Ec2InstanceNode } from '../../../awsService/ec2/explorer/ec2InstanceNode'
import { Ec2ParentNode } from '../../../awsService/ec2/explorer/ec2ParentNode'
import { Ec2Wrapper } from '../../../shared/clients/ec2Wrapper'
import { Ec2Connecter } from '../../../awsService/ec2/model'
import { PollingSet } from '../../../shared/utilities/pollingSet'
import { InstanceStateName } from '@aws-sdk/client-ec2'

describe('ec2 activation', function () {
    let testNode: Ec2InstanceNode

    before(function () {
        const testRegion = 'test-region'
        const testPartition = 'test-partition'
        // Don't want to be polling here, that is tested in ../ec2ParentNode.test.ts
        // disabled here for convenience (avoiding race conditions with timeout)
        sinon.stub(PollingSet.prototype, 'start')
        const testClient = new Ec2Wrapper(testRegion)
        const parentNode = new Ec2ParentNode(testRegion, testPartition, new Ec2Wrapper(testRegion))
        testNode = new Ec2InstanceNode(parentNode, testClient, testRegion, testPartition, {
            InstanceId: 'testId',
            LastSeenStatus: 'status' as InstanceStateName,
        })
    })

    after(function () {
        sinon.restore()
    })

    it('telemetry', async function () {
        const terminalStub = sinon.stub(Ec2Connecter.prototype, 'attemptToOpenEc2Terminal')
        await vscode.commands.executeCommand('aws.ec2.openTerminal', testNode)

        assertTelemetry('ec2_connectToInstance', { ec2ConnectionType: 'ssm' })
        terminalStub.restore()

        const stopInstanceStub = sinon.stub(Ec2Wrapper.prototype, 'stopInstanceWithCancel')
        await vscode.commands.executeCommand('aws.ec2.stopInstance', testNode)

        assertTelemetry('ec2_changeState', { ec2InstanceState: 'stop' })
        stopInstanceStub.restore()
    })
})
