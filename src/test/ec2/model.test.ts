/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ServiceException } from '@aws-sdk/smithy-client'
import { InstanceStateName } from '@aws-sdk/client-ec2'
import { Ec2ConnectErrorCode, Ec2ConnectionManager } from '../../ec2/model'
import { SsmClient } from '../../shared/clients/ssmClient'
import { Ec2Client } from '../../shared/clients/ec2Client'
import { attachedPoliciesListType } from 'aws-sdk/clients/iam'
import { Ec2Selection } from '../../ec2/utils'
import { ToolkitError } from '../../shared/errors'

describe('Ec2ConnectClient', function () {
    class MockSsmClient extends SsmClient {
        public constructor() {
            super('test-region')
        }
    }

    class MockEc2Client extends Ec2Client {
        public constructor() {
            super('test-region')
        }

        public override async getInstanceStatus(instanceId: string): Promise<InstanceStateName> {
            return instanceId.split(':')[0] as InstanceStateName
        }
    }

    class MockEc2ConnectClient extends Ec2ConnectionManager {
        public constructor() {
            super('test-region')
        }

        protected override createSsmSdkClient(): SsmClient {
            return new MockSsmClient()
        }

        protected override createEc2SdkClient(): Ec2Client {
            return new MockEc2Client()
        }
    }
    describe('handleStartSessionError', async function () {
        let client: MockEc2ConnectClientForError
        const dummyError: ServiceException = {} as ServiceException

        class MockEc2ConnectClientForError extends MockEc2ConnectClient {
            public override async hasProperPolicies(instanceId: string): Promise<boolean> {
                return instanceId.split(':')[1] === 'hasPolicies'
            }
        }
        before(function () {
            client = new MockEc2ConnectClientForError()
        })

        it('determines which error to throw based on if instance is running', async function () {
            async function testThrowsError(testInstance: Ec2Selection, errCode: Ec2ConnectErrorCode) {
                try {
                    await client.handleStartSessionError(dummyError, testInstance)
                } catch (err: unknown) {
                    assert.strictEqual((err as ToolkitError).code, errCode)
                }
            }

            await testThrowsError(
                {
                    instanceId: 'pending:noPolicies',
                    region: 'test-region',
                },
                'EC2SSMStatusError'
            )

            await testThrowsError(
                {
                    instanceId: 'shutting-down:noPolicies',
                    region: 'test-region',
                },
                'EC2SSMStatusError'
            )

            await testThrowsError(
                {
                    instanceId: 'running:noPolicies',
                    region: 'test-region',
                },
                'EC2SSMPermissionError'
            )

            await testThrowsError(
                {
                    instanceId: 'running:hasPolicies',
                    region: 'test-region',
                },
                'EC2SSMConnectError'
            )
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
