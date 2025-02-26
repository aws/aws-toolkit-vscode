/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2Connecter, getRemoveLinesCommand } from '../../../awsService/ec2/model'
import { SsmClient } from '../../../shared/clients/ssm'
import { Ec2Client } from '../../../shared/clients/ec2'
import { Ec2Selection } from '../../../awsService/ec2/prompter'
import { ToolkitError } from '../../../shared/errors'
import { IAM } from 'aws-sdk'
import { SshKeyPair } from '../../../awsService/ec2/sshKeyPair'
import { DefaultIamClient } from '../../../shared/clients/iamClient'
import { assertNoTelemetryMatch, createTestWorkspaceFolder } from '../../testUtil'
import { fs } from '../../../shared'
import path from 'path'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { isMac, isWin } from '../../../shared/vscode/env'
import { inspect } from '../../../shared/utilities/collectionUtils'
import { assertLogsContain } from '../../globalSetup.test'
import { InstanceStateName } from '@aws-sdk/client-ec2'

describe('Ec2ConnectClient', function () {
    let client: Ec2Connecter

    before(function () {
        client = new Ec2Connecter('test-region')
    })

    describe('getAttachedIamRole', async function () {
        it('only returns role if receives ARN from instance profile', async function () {
            let role: IAM.Role | undefined
            const getInstanceProfileStub = sinon.stub(Ec2Client.prototype, 'getAttachedIamInstanceProfile')

            getInstanceProfileStub.resolves({ Arn: 'thisIsAnArn' })
            sinon
                .stub(DefaultIamClient.prototype, 'getIAMRoleFromInstanceProfile')
                .resolves({ Arn: 'ThisIsARoleArn' } as IAM.Role)

            role = await client.getAttachedIamRole('test-instance')
            assert.ok(role)
            assert.ok(role.Arn)

            getInstanceProfileStub.resolves({})
            role = await client.getAttachedIamRole('test-instance')
            assert.strictEqual(role, undefined)
            sinon.restore()
        })
    })

    describe('hasProperPermissions', async function () {
        it('throws error when sdk throws error', async function () {
            sinon.stub(DefaultIamClient.prototype, 'simulatePrincipalPolicy').throws(new ToolkitError('error'))

            try {
                await client.hasProperPermissions('')
                assert.ok(false)
            } catch {
                assert.ok(true)
            }

            sinon.restore()
        })
    })

    describe('isInstanceRunning', async function () {
        it('only returns true with the instance is running', async function () {
            sinon
                .stub(Ec2Client.prototype, 'getInstanceStatus')
                .callsFake(async (input: string) => input.split(':')[0] as InstanceStateName)

            const actualFirstResult = await client.isInstanceRunning('running:instance')
            const actualSecondResult = await client.isInstanceRunning('stopped:instance')

            assert.strictEqual(true, actualFirstResult)
            assert.strictEqual(false, actualSecondResult)
            sinon.restore()
        })
    })

    describe('handleStartSessionError', async function () {
        let instanceSelection: Ec2Selection

        before(function () {
            instanceSelection = { instanceId: 'testInstance', region: 'testRegion' }
        })

        afterEach(function () {
            sinon.restore()
        })

        it('throws EC2SSMStatus error if instance is not running', async function () {
            sinon.stub(Ec2Connecter.prototype, 'isInstanceRunning').resolves(false)

            try {
                await client.checkForStartSessionError(instanceSelection)
                assert.ok(false)
            } catch (err) {
                assert.strictEqual((err as ToolkitError).code, 'EC2SSMStatus')
            }
        })

        it('throws EC2SSMPermission error if instance is running but has no role', async function () {
            sinon.stub(Ec2Connecter.prototype, 'isInstanceRunning').resolves(true)
            sinon.stub(Ec2Connecter.prototype, 'getAttachedIamRole').resolves(undefined)

            try {
                await client.checkForStartSessionError(instanceSelection)
                assert.ok(false)
            } catch (err) {
                assert.strictEqual((err as ToolkitError).code, 'EC2SSMPermission')
            }
        })

        it('throws EC2SSMAgent error if instance is running and has IAM Role, but agent is not running', async function () {
            sinon.stub(Ec2Connecter.prototype, 'isInstanceRunning').resolves(true)
            sinon.stub(Ec2Connecter.prototype, 'getAttachedIamRole').resolves({ Arn: 'testRole' } as IAM.Role)
            sinon.stub(Ec2Connecter.prototype, 'hasProperPermissions').resolves(true)
            sinon.stub(SsmClient.prototype, 'getInstanceAgentPingStatus').resolves('offline')

            try {
                await client.checkForStartSessionError(instanceSelection)
                assert.ok(false)
            } catch (err) {
                assert.strictEqual((err as ToolkitError).code, 'EC2SSMAgentStatus')
            }
        })

        it('does not throw an error if all checks pass', async function () {
            sinon.stub(Ec2Connecter.prototype, 'isInstanceRunning').resolves(true)
            sinon.stub(Ec2Connecter.prototype, 'getAttachedIamRole').resolves({ Arn: 'testRole' } as IAM.Role)
            sinon.stub(Ec2Connecter.prototype, 'hasProperPermissions').resolves(true)
            sinon.stub(SsmClient.prototype, 'getInstanceAgentPingStatus').resolves('Online')

            assert.doesNotThrow(async () => await client.checkForStartSessionError(instanceSelection))
        })
    })

    describe('sendSshKeysToInstance', async function () {
        it('calls the sdk with the proper parameters', async function () {
            const sendCommandStub = sinon.stub(SsmClient.prototype, 'sendCommandAndWait')

            const testSelection = {
                instanceId: 'test-id',
                region: 'test-region',
            }

            const keys = await SshKeyPair.getSshKeyPair('key', 30000)
            await client.sendSshKeyToInstance(testSelection, keys, { name: 'test-user', os: 'Amazon Linux' })
            sinon.assert.calledWith(sendCommandStub, testSelection.instanceId, 'AWS-RunShellScript')
            sinon.restore()
        })

        it('avoids writing the keys to any telemetry metrics', async function () {
            sinon.stub(SsmClient.prototype, 'sendCommandAndWait')

            const testSelection = {
                instanceId: 'test-id',
                region: 'test-region',
            }
            const testWorkspaceFolder = await createTestWorkspaceFolder()
            const keys = await SshKeyPair.getSshKeyPair('key', 60000)
            await client.sendSshKeyToInstance(testSelection, keys, { name: 'test-user', os: 'Amazon Linux' })
            const privKey = await fs.readFileText(keys.getPrivateKeyPath())
            assertNoTelemetryMatch(privKey)
            sinon.restore()

            await keys.delete()
            await fs.delete(testWorkspaceFolder.uri, { force: true })
        })
    })

    describe('getRemoteUser', async function () {
        let getTargetPlatformNameStub: sinon.SinonStub<[target: string], Promise<string>>

        before(async function () {
            getTargetPlatformNameStub = sinon.stub(SsmClient.prototype, 'getTargetPlatformName')
        })

        after(async function () {
            sinon.restore()
        })

        it('identifies the user for ubuntu as ubuntu', async function () {
            getTargetPlatformNameStub.resolves('Ubuntu')
            const remoteUser = await client.getRemoteUser('testInstance')
            assert.strictEqual(remoteUser.name, 'ubuntu')
        })

        it('identifies the user for amazon linux as ec2-user', async function () {
            getTargetPlatformNameStub.resolves('Amazon Linux')
            const remoteUser = await client.getRemoteUser('testInstance')
            assert.strictEqual(remoteUser.name, 'ec2-user')
        })

        it('throws error when not given known OS', async function () {
            getTargetPlatformNameStub.resolves('ThisIsNotARealOs!')
            try {
                await client.getRemoteUser('testInstance')
                assert.ok(false)
            } catch (exception) {
                assert.ok(true)
            }
        })
    })

    describe('tryCleanKeys', async function () {
        it('calls the sdk with the proper parameters', async function () {
            const sendCommandStub = sinon.stub(SsmClient.prototype, 'sendCommandAndWait')

            const testSelection = {
                instanceId: 'test-id',
                region: 'test-region',
            }

            await client.tryCleanKeys(testSelection.instanceId, 'hint', 'macOS', 'path/to/keys')
            sendCommandStub.calledWith(testSelection.instanceId, 'AWS-RunShellScript', {
                commands: [getRemoveLinesCommand('hint', 'macOS', 'path/to/keys')],
            })
            sinon.assert.calledWith(sendCommandStub, testSelection.instanceId, 'AWS-RunShellScript')
            sinon.restore()
        })

        it('logs warning when sdk call fails', async function () {
            const sendCommandStub = sinon
                .stub(SsmClient.prototype, 'sendCommandAndWait')
                .throws(new ToolkitError('error'))

            const testSelection = {
                instanceId: 'test-id',
                region: 'test-region',
            }

            await client.tryCleanKeys(testSelection.instanceId, 'hint', 'macOS', 'path/to/keys')
            sinon.assert.calledWith(sendCommandStub, testSelection.instanceId, 'AWS-RunShellScript', {
                commands: [getRemoveLinesCommand('hint', 'macOS', 'path/to/keys')],
            })
            sinon.restore()
            assertLogsContain('failed to clean keys', false, 'warn')
        })
    })
})

describe('getRemoveLinesCommand', async function () {
    let tempPath: { uri: { fsPath: string } }

    before(async function () {
        tempPath = await createTestWorkspaceFolder()
    })

    after(async function () {
        await fs.delete(tempPath.uri.fsPath, { recursive: true, force: true })
    })

    it('removes lines containing pattern', async function () {
        if (isWin()) {
            this.skip()
        }
        // For the test, we only need to distinguish mac and linux
        const hostOS = isMac() ? 'macOS' : 'Amazon Linux'
        const lines = ['line1', 'line2 pattern', 'line3', 'line4 pattern', 'line5', 'line6 pattern', 'line7']
        const expected = ['line1', 'line3', 'line5', 'line7']

        const lineToStr = (ls: string[]) => ls.join('\n') + '\n'

        const textFile = path.join(tempPath.uri.fsPath, 'test.txt')
        const originalContent = lineToStr(lines)
        await fs.writeFile(textFile, originalContent)
        const [command, ...args] = getRemoveLinesCommand('pattern', hostOS, textFile).split(' ')
        const process = new ChildProcess(command, args, { collect: true })
        const result = await process.run()
        assert.strictEqual(
            result.exitCode,
            0,
            `Ran command '${command} ${args.join(' ')}' and failed with result ${inspect(result)}`
        )

        const newContent = await fs.readFileText(textFile)
        assert.notStrictEqual(newContent, originalContent)
        assert.strictEqual(newContent, lineToStr(expected))
    })

    it('includes empty extension on macOS only', async function () {
        const macCommand = getRemoveLinesCommand('pattern', 'macOS', 'test.txt')
        const alCommand = getRemoveLinesCommand('pattern', 'Amazon Linux', 'test.txt')
        const ubuntuCommand = getRemoveLinesCommand('pattern', 'Ubuntu', 'test.txt')

        assert.ok(macCommand.includes("''"))
        assert.ok(!alCommand.includes("''"))
        assert.strictEqual(ubuntuCommand, alCommand)
    })

    it('throws when given invalid pattern', function () {
        assert.throws(() => getRemoveLinesCommand('pat/tern', 'macOS', 'test.txt'))
    })
})
