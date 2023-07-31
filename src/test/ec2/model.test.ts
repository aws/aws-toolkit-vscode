/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { Ec2ConnectionManager } from '../../ec2/model'
import { SsmClient } from '../../shared/clients/ssmClient'
import { Ec2Selection } from '../../ec2/prompter'
import { ToolkitError } from '../../shared/errors'
import { IAM } from 'aws-sdk'
import { DefaultIamClient } from '../../shared/clients/iamClient'

describe('Ec2ConnectClient', function () {
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
})
