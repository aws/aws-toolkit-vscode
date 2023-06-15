/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EC2 } from 'aws-sdk'
import { Ec2ConnectClient, Ec2ConnectErrorName, Ec2ConnectErrorParameters } from '../../ec2/client'
import { Ec2Selection } from '../../ec2/utils'

describe('Ec2ConnectClient', function () {
    class MockEc2ConnectClient extends Ec2ConnectClient {
        public constructor() {
            super('')
        }
        public override async getInstanceStatus(instanceId: string): Promise<EC2.InstanceStateName> {
            console.log('Running the instance getter')
            return instanceId.split('-')[0]
        }
        protected override async showError(
            errorName: Ec2ConnectErrorName,
            params: Ec2ConnectErrorParameters
        ): Promise<string> {
            console.log('running the show error')
            return errorName
        }
    }
    describe('handleStartSessionError', async function () {
        let client: MockEc2ConnectClient
        before(function () {
            client = new MockEc2ConnectClient()
        })

        it('determines which error to throw based on if instance is running', async function () {
            const result = await client.handleStartSessionError({ instanceId: 'pending-instance', region: '' })
            assert.strictEqual('instanceStatus', result)
        })
    })
})
