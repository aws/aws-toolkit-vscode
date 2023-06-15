/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Ec2ConnectClient, Ec2ConnectErrorName, Ec2ConnectErrorParameters } from '../../ec2/model'
import { DefaultSsmClient } from '../../shared/clients/ssmClient'
import { DefaultEc2Client } from '../../shared/clients/ec2Client'

describe('Ec2ConnectClient', function () {
        class MockSsmClient extends DefaultSsmClient {
            public constructor () {
                super('test-region')
            }
        }

        class MockEc2Client extends DefaultEc2Client {
            public constructor () {
                super('test-region')
            }

            public override async getInstanceStatus(instanceId: string): Promise<string> {
                return instanceId.split(':')[0]
            }
        }

        class MockEc2ConnectClient extends Ec2ConnectClient {
            public constructor () {
                super('test-region')
            }

            protected override createSsmSdkClient(): DefaultSsmClient {
                return new MockSsmClient()
            }
        
            protected override createEc2SdkClient(): DefaultEc2Client {
                return new MockEc2Client()
            } 

            protected override async showError(errorName: Ec2ConnectErrorName, params: Ec2ConnectErrorParameters): Promise<string> {
                return errorName
            }
        }
        describe('handleStartSessionError', async function () {

            it('determines which error to throw based on if instance is running', async function () {
                const client = new MockEc2ConnectClient()
                let result: string
                result = await client.handleStartSessionError({instanceId: 'pending:instance', region: 'test-region'})
                assert.strictEqual('instanceStatus', result)
                
                result = await client.handleStartSessionError({instanceId: 'shutting-down:instance', region: 'test-region'})
                assert.strictEqual('instanceStatus', result)

                result = await client.handleStartSessionError({instanceId: 'running:instance', region: 'test-region'})
                assert.strictEqual('permission', result)

            })
        })
})
