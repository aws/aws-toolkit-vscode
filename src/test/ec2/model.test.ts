/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { Ec2ConnectErrorCode, Ec2ConnectionManager } from '../../ec2/model'
import { SsmClient } from '../../shared/clients/ssmClient'
import { Ec2Client } from '../../shared/clients/ec2Client'
import { attachedPoliciesListType } from 'aws-sdk/clients/iam'
import { Ec2Selection } from '../../ec2/utils'
import { ToolkitError } from '../../shared/errors'
import { EC2, IAM } from 'aws-sdk'
import { DefaultIamClient } from '../../shared/clients/iamClient'

describe('Ec2ConnectClient', function () {
    class MockSsmClient extends SsmClient {
        public constructor() {
            super('test-region')
        }

        public override async getInstanceAgentPingStatus(target: string): Promise<string> {
            return target.split(':')[2]
        }
    }

    class MockEc2Client extends Ec2Client {
        public constructor() {
            super('test-region')
        }

        public override async getInstanceStatus(instanceId: string): Promise<EC2.InstanceStateName> {
            return instanceId.split(':')[0] as EC2.InstanceStateName
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

        public async testGetAttachedPolicies(instanceId: string): Promise<IAM.attachedPoliciesListType> {
            return await this.getAttachedPolicies(instanceId)
        }

        protected override async throwPolicyError(selection: Ec2Selection): Promise<void> {
            this.throwConnectionError('', selection, {
                code: 'EC2SSMPermission',
            })
        }
    }

    describe('isInstanceRunning', async function () {
        let client: MockEc2ConnectClient

        before(function () {
            client = new MockEc2ConnectClient()
        })

        it('only returns true with the instance is running', async function () {
            const actualFirstResult = await client.isInstanceRunning('running:noPolicies')
            const actualSecondResult = await client.isInstanceRunning('stopped:noPolicies')

            assert.strictEqual(true, actualFirstResult)
            assert.strictEqual(false, actualSecondResult)
        })
    })

    describe('handleStartSessionError', async function () {
        let client: MockEc2ConnectClientForError

        class MockEc2ConnectClientForError extends MockEc2ConnectClient {
            public override async hasProperPolicies(instanceId: string): Promise<boolean> {
                return instanceId.split(':')[1] === 'hasPolicies'
            }
        }
        before(function () {
            client = new MockEc2ConnectClientForError()
        })

        it('determines which error to throw based on if instance is running', async function () {
            async function assertThrowsErrorCode(testInstance: Ec2Selection, errCode: Ec2ConnectErrorCode) {
                try {
                    await client.checkForStartSessionError(testInstance)
                } catch (err: unknown) {
                    assert.strictEqual((err as ToolkitError).code, errCode)
                }
            }

            await assertThrowsErrorCode(
                {
                    instanceId: 'pending:noPolicies:Online',
                    region: 'test-region',
                },
                'EC2SSMStatus'
            )

            await assertThrowsErrorCode(
                {
                    instanceId: 'shutting-down:noPolicies:Online',
                    region: 'test-region',
                },
                'EC2SSMStatus'
            )

            await assertThrowsErrorCode(
                {
                    instanceId: 'running:noPolicies:Online',
                    region: 'test-region',
                },
                'EC2SSMPermission'
            )

            await assertThrowsErrorCode(
                {
                    instanceId: 'running:hasPolicies:Offline',
                    region: 'test-region',
                },
                'EC2SSMAgentStatus'
            )
        })

        it('does not throw an error if all checks pass', async function () {
            const passingInstance = {
                instanceId: 'running:hasPolicies:Online',
                region: 'test-region',
            }
            assert.doesNotThrow(async () => await client.checkForStartSessionError(passingInstance))
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
                    case 'toolkitErrorInstance':
                        throw new ToolkitError('', { code: 'NoSuchEntity' })
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
            assert.strictEqual(result, false)

            result = await client.hasProperPolicies('secondInstance')
            assert.strictEqual(result, true)

            result = await client.hasProperPolicies('thirdInstance')
            assert.strictEqual(result, false)

            result = await client.hasProperPolicies('fourthInstance')
            assert.strictEqual(result, false)
        })

        it('throws error when sdk throws error', async function () {
            try {
                await client.hasProperPolicies('toolkitErrorInstance')
                assert.ok(false)
            } catch {
                assert.ok(true)
            }
        })
    })

    describe('getAttachedPolicies', async function () {
        let client: MockEc2ConnectClient

        before(async function () {
            client = new MockEc2ConnectClient()
        })

        it('returns empty when IamInstanceProfile not found', async function () {
            sinon
                .stub(MockEc2ConnectClient.prototype, 'getAttachedIamRole')
                .throws(new ToolkitError('', { code: 'NoIamInstanceProfile' }))
            const response = await client.testGetAttachedPolicies('test-instance')
            assert.deepStrictEqual(response, [])

            sinon.restore()
        })

        it('throws error if IamRole is found but invalid', async function () {
            sinon
                .stub(MockEc2ConnectClient.prototype, 'getAttachedIamRole')
                .resolves({ Arn: 'some-fake-role' } as IAM.Role)
            sinon.stub(DefaultIamClient.prototype, 'listAttachedRolePolicies').throws('NoSuchEntity')
            try {
                await client.testGetAttachedPolicies('test-instance')
                assert.ok(false)
            } catch {
                assert.ok(true)
            } finally {
                sinon.restore()
            }
        })
    })
})
