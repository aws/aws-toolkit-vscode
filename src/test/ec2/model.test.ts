/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { Ec2ConnectionManager } from '../../ec2/model'
import { SsmClient } from '../../shared/clients/ssmClient'
import { Ec2Client } from '../../shared/clients/ec2Client'
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
        let client: Ec2ConnectionManager
        let instanceSelection: Ec2Selection

        before(function () {
            client = new Ec2ConnectionManager('test-region')
            instanceSelection = { instanceId: 'testInstance', region: 'testRegion' }
        })

        it('throws EC2SSMStatus error if instance is not running', async function () {
            sinon.stub(Ec2ConnectionManager.prototype, 'isInstanceRunning').resolves(false)
            try {
                await client.checkForStartSessionError(instanceSelection)
                assert.ok(false)
            } catch (err) {
                assert.strictEqual((err as ToolkitError).code, 'EC2SSMStatus')
            }
            sinon.restore()
        })

        it('throws EC2SSMPermission error if instance is running but has no role', async function () {
            sinon.stub(Ec2ConnectionManager.prototype, 'isInstanceRunning').resolves(true)
            sinon.stub(Ec2ConnectionManager.prototype, 'getAttachedIamRole').resolves(undefined)
            try {
                await client.checkForStartSessionError(instanceSelection)
                assert.ok(false)
            } catch (err) {
                assert.strictEqual((err as ToolkitError).code, 'EC2SSMPermission')
            }
            sinon.restore()
        })

        it('throws EC2SSMAgent error if instance is running and has IAM Role, but agent is not running', async function () {
            sinon.stub(Ec2ConnectionManager.prototype, 'isInstanceRunning').resolves(true)
            sinon.stub(Ec2ConnectionManager.prototype, 'getAttachedIamRole').resolves({ Arn: 'testRole' } as IAM.Role)
            sinon.stub(Ec2ConnectionManager.prototype, 'hasProperPolicies').resolves(true)
            sinon.stub(SsmClient.prototype, 'getInstanceAgentPingStatus').resolves('offline')
            try {
                await client.checkForStartSessionError(instanceSelection)
                assert.ok(false)
            } catch (err) {
                assert.strictEqual((err as ToolkitError).code, 'EC2SSMAgentStatus')
            }
            sinon.restore()
        })

        it('does not throw an error if all checks pass', async function () {
            sinon.stub(Ec2ConnectionManager.prototype, 'isInstanceRunning').resolves(true)
            sinon.stub(Ec2ConnectionManager.prototype, 'getAttachedIamRole').resolves({ Arn: 'testRole' } as IAM.Role)
            sinon.stub(Ec2ConnectionManager.prototype, 'hasProperPolicies').resolves(true)
            sinon.stub(SsmClient.prototype, 'getInstanceAgentPingStatus').resolves('Online')
            assert.doesNotThrow(async () => await client.checkForStartSessionError(instanceSelection))
            sinon.restore()
        })
    })

    describe('hasProperPolicies', async function () {
        let realClient: Ec2ConnectionManager

        before(async function () {
            realClient = new Ec2ConnectionManager('test-region')
        })

        it('correctly determines if proper policies are included', async function () {
            async function assertAcceptsPolicies(policies: IAM.Policy[], expectedResult: boolean) {
                sinon.stub(DefaultIamClient.prototype, 'listAttachedRolePolicies').resolves(policies)
                const result = await realClient.hasProperPolicies('')
                assert.strictEqual(result, expectedResult)
                sinon.restore()
            }
            await assertAcceptsPolicies(
                [{ PolicyName: 'name' }, { PolicyName: 'name2' }, { PolicyName: 'name3' }],
                false
            )
            await assertAcceptsPolicies(
                [
                    { PolicyName: 'AmazonSSMManagedInstanceCore' },
                    { PolicyName: 'AmazonSSMManagedEC2InstanceDefaultPolicy' },
                ],
                true
            )
            await assertAcceptsPolicies([{ PolicyName: 'AmazonSSMManagedEC2InstanceDefaultPolicy' }], false)
            await assertAcceptsPolicies([{ PolicyName: 'AmazonSSMManagedEC2InstanceDefaultPolicy' }], false)
        })

        it('throws error when sdk throws error', async function () {
            sinon.stub(DefaultIamClient.prototype, 'listAttachedRolePolicies').throws(new ToolkitError('error'))
            try {
                await realClient.hasProperPolicies('')
                assert.ok(false)
            } catch {
                assert.ok(true)
            }
            sinon.restore()
        })
    })

    // describe('getAttachedPolicies', async function () {
    //     let client: MockEc2ConnectClient

    //     before(async function () {
    //         client = new MockEc2ConnectClient()
    //     })

    //     it('returns empty when IamInstanceProfile not found', async function () {
    //         sinon
    //             .stub(MockEc2ConnectClient.prototype, 'getAttachedIamRole')
    //             .throws(new ToolkitError('', { code: 'NoIamInstanceProfile' }))
    //         const response = await client.testGetAttachedPolicies('test-instance')
    //         assert.deepStrictEqual(response, [])

    //         sinon.restore()
    //     })

    //     it('throws error if IamRole is found but invalid', async function () {
    //         sinon
    //             .stub(MockEc2ConnectClient.prototype, 'getAttachedIamRole')
    //             .resolves({ Arn: 'some-fake-role' } as IAM.Role)
    //         sinon.stub(DefaultIamClient.prototype, 'listAttachedRolePolicies').throws('NoSuchEntity')
    //         try {
    //             await client.testGetAttachedPolicies('test-instance')
    //             assert.ok(false)
    //         } catch {
    //             assert.ok(true)
    //         } finally {
    //             sinon.restore()
    //         }
    //     })
    // })
})
