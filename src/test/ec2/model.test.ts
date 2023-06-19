/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Ec2SsmConnecter, Ec2ConnectErrorName, Ec2ConnectErrorParameters } from '../../ec2/model'
import { DefaultSsmClient } from '../../shared/clients/ssmClient'
import { DefaultEc2Client } from '../../shared/clients/ec2Client'
import { AWSError } from 'aws-sdk'
import { attachedPoliciesListType } from 'aws-sdk/clients/iam'

describe('Ec2ConnectClient', function () {
    class MockSsmClient extends DefaultSsmClient {
        public constructor() {
            super('test-region')
        }
    }

    class MockEc2Client extends DefaultEc2Client {
        public constructor() {
            super('test-region')
        }

        public override async getInstanceStatus(instanceId: string): Promise<string> {
            return instanceId.split(':')[0]
        }
    }

    class MockEc2ConnectClient extends Ec2SsmConnecter {
        public constructor() {
            super('test-region')
        }

        protected override createSsmSdkClient(): DefaultSsmClient {
            return new MockSsmClient()
        }

        protected override createEc2SdkClient(): DefaultEc2Client {
            return new MockEc2Client()
        }

        protected override async showConnectError(
            errorName: Ec2ConnectErrorName,
            params: Ec2ConnectErrorParameters
        ): Promise<string> {
            return errorName
        }
    }
    describe('handleStartSessionError', async function () {
        let client: MockEc2ConnectClientForError
        let dummyError: AWSError

        class MockEc2ConnectClientForError extends MockEc2ConnectClient {
            public override async hasProperPolicies(instanceId: string): Promise<boolean> {
                return instanceId.split(':')[1] === 'hasPolicies'
            }
        }
        before(function () {
            client = new MockEc2ConnectClientForError()
            dummyError = {} as AWSError
        })

        it('determines which error to throw based on if instance is running', async function () {
            let result: string
            result = await client.handleStartSessionError(dummyError, {
                instanceId: 'pending:noPolicies',
                region: 'test-region',
            })
            assert.strictEqual('instanceStatus', result)

            result = await client.handleStartSessionError(dummyError, {
                instanceId: 'shutting-down:noPolicies',
                region: 'test-region',
            })
            assert.strictEqual('instanceStatus', result)

            result = await client.handleStartSessionError(dummyError, {
                instanceId: 'running:noPolicies',
                region: 'test-region',
            })
            assert.strictEqual('permission', result)
        })
    })

    describe('hasProperPolicies', async function () {
        let client: MockEc2ConnectClientForPolicies
        class MockEc2ConnectClientForPolicies extends MockEc2ConnectClient {
            protected override async getAttachedPolicies(instanceId: string): Promise<attachedPoliciesListType> {
                switch (instanceId) {
                    case 'firstInstance':
                        return [
                            {
                                PolicyName: 'name',
                            },
                            {
                                PolicyName: 'name2',
                            },
                            {
                                PolicyName: 'name3',
                            },
                        ]
                    case 'secondInstance':
                        return [
                            {
                                PolicyName: 'AmazonSSMManagedInstanceCore',
                            },
                            {
                                PolicyName: 'AmazonSSMManagedEC2InstanceDefaultPolicy',
                            },
                        ]
                    case 'thirdInstance':
                        return [
                            {
                                PolicyName: 'AmazonSSMManagedInstanceCore',
                            },
                        ]
                    case 'fourthInstance':
                        return [
                            {
                                PolicyName: 'AmazonSSMManagedEC2InstanceDefaultPolicy',
                            },
                        ]
                    default:
                        return []
                }
            }
        }
        before(function () {
            client = new MockEc2ConnectClientForPolicies()
        })

        it('correctly determines if proper policies are included', async function () {
            let result: boolean

            result = await client.hasProperPolicies('firstInstance')
            assert.strictEqual(false, result)

            result = await client.hasProperPolicies('secondInstance')
            assert.strictEqual(true, result)

            result = await client.hasProperPolicies('thirdInstance')
            assert.strictEqual(false, result)

            result = await client.hasProperPolicies('fourthInstance')
            assert.strictEqual(false, result)
        })
    })
})
