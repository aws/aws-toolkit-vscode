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
import { SshKeyPair } from '../../../awsService/ec2/sshKeyPair'
import { IamClient, IamRole } from '../../../shared/clients/iam'
import { assertNoTelemetryMatch, createTestWorkspaceFolder } from '../../testUtil'
import { fs } from '../../../shared'
import path from 'path'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { isWin } from '../../../shared/vscode/env'
import { inspect } from '../../../shared/utilities/collectionUtils'
import { assertLogsContain } from '../../globalSetup.test'
import { InstanceStateName } from '@aws-sdk/client-ec2'
import { getTestWindow } from '../../shared/vscode/window'

describe('Ec2ConnectClient', function () {
    let client: Ec2Connecter

    before(function () {
        client = new Ec2Connecter('test-region')
    })

    describe('getAttachedIamRole', async function () {
        it('only returns role if receives ARN from instance profile', async function () {
            let role: IamRole | undefined
            const getInstanceProfileStub = sinon.stub(Ec2Client.prototype, 'getAttachedIamInstanceProfile')

            getInstanceProfileStub.resolves({ Arn: 'thisIsAnArn' })
            sinon
                .stub(IamClient.prototype, 'getIAMRoleFromInstanceProfile')
                .resolves(createRoleWithArn('ThisIsARoleArn'))

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
            sinon.stub(IamClient.prototype, 'simulatePrincipalPolicy').throws(new ToolkitError('error'))

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
            sinon.stub(Ec2Connecter.prototype, 'getAttachedIamRole').resolves(createRoleWithArn('testRole'))
            sinon.stub(Ec2Connecter.prototype, 'hasProperPermissions').resolves(true)
            sinon.stub(SsmClient.prototype, 'getInstanceAgentPingStatus').resolves('offline')

            try {
                await client.checkForStartSessionError(instanceSelection)
                assert.ok(false)
            } catch (err) {
                assert.strictEqual((err as ToolkitError).code, 'EC2SSMAgentStatus')
            }
        })

        it('retries if agent status is not online', async function () {
            const instanceAgentStatus = sinon.stub(SsmClient.prototype, 'getInstanceAgentPingStatus')
            instanceAgentStatus.onFirstCall().resolves('Offline')
            instanceAgentStatus.onSecondCall().resolves('Online')
            try {
                await client.checkForInstanceSsmError(instanceSelection, { interval: 10, timeout: 100 })
            } catch (err) {
                assert.ok(false, `checkForInstanceSsmError failed with error '${err}'`)
            }
        })

        it('does not throw an error if all checks pass', async function () {
            sinon.stub(Ec2Connecter.prototype, 'isInstanceRunning').resolves(true)
            sinon.stub(Ec2Connecter.prototype, 'getAttachedIamRole').resolves(createRoleWithArn('testRole'))
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
            await client.sendSshKeyToInstance(testSelection, keys, {
                name: 'test-user',
                os: 'Amazon Linux',
                home: '/srv/test user',
            })
            sinon.assert.calledWith(sendCommandStub, testSelection.instanceId, 'AWS-RunShellScript')
            assert.match(sendCommandStub.firstCall.args[2].commands[0], /mkdir -p '\/srv\/test user\/\.ssh'/)
            assert.match(sendCommandStub.firstCall.args[2].commands[0], /chmod 700/)
            assert.match(sendCommandStub.firstCall.args[2].commands[0], /chmod 600/)
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
            await client.sendSshKeyToInstance(testSelection, keys, {
                name: 'test-user',
                os: 'Amazon Linux',
                home: '/home/test-user',
            })
            const privKey = await fs.readFileText(keys.getPrivateKeyPath())
            assertNoTelemetryMatch(privKey)
            sinon.restore()

            await keys.delete()
            await fs.delete(testWorkspaceFolder.uri, { force: true })
        })
    })

    describe('getRemoteUser', async function () {
        let getTargetPlatformNameStub: sinon.SinonStub<[target: string], Promise<string>>
        let getCommandOutputStub: sinon.SinonStub

        beforeEach(function () {
            getTargetPlatformNameStub = sinon.stub(SsmClient.prototype, 'getTargetPlatformName')
            getCommandOutputStub = sinon.stub(SsmClient.prototype, 'sendCommandAndWaitForOutput')
        })

        afterEach(function () {
            sinon.restore()
        })

        it('identifies the user and home for ubuntu', async function () {
            getTargetPlatformNameStub.resolves('Ubuntu')
            getCommandOutputStub.resolves('/home/ubuntu\n')
            const remoteUser = await client.getRemoteUser('testInstance')
            assert.deepStrictEqual(remoteUser, { name: 'ubuntu', os: 'Ubuntu', home: '/home/ubuntu' })
            sinon.assert.calledWith(
                getCommandOutputStub,
                'testInstance',
                'AWS-RunShellScript',
                sinon.match({ commands: ["getent passwd 'ubuntu' | cut -d: -f6"] })
            )
        })

        it('identifies the user and home for amazon linux', async function () {
            getTargetPlatformNameStub.resolves('Amazon Linux')
            getCommandOutputStub.resolves('/home/ec2-user\n')
            const remoteUser = await client.getRemoteUser('testInstance')
            assert.deepStrictEqual(remoteUser, {
                name: 'ec2-user',
                os: 'Amazon Linux',
                home: '/home/ec2-user',
            })
        })

        it('uses the selected user and its actual home for an unknown OS', async function () {
            getTargetPlatformNameStub.resolves('ThisIsNotARealOs!')
            getCommandOutputStub.resolves('/srv/workspaces/developer\n')
            getTestWindow().onDidShowInputBox((input) => input.acceptValue(' developer '))
            const remoteUser = await client.getRemoteUser('testInstance')
            assert.deepStrictEqual(remoteUser, {
                name: 'developer',
                os: 'ThisIsNotARealOs!',
                home: '/srv/workspaces/developer',
            })
        })

        it('rejects an unknown user without a valid home directory', async function () {
            getTargetPlatformNameStub.resolves('Debian')
            getCommandOutputStub.resolves('')
            getTestWindow().onDidShowInputBox((input) => input.acceptValue('missing-user'))
            await assert.rejects(client.getRemoteUser('testInstance'), { code: 'UnknownEc2User' })
        })

        for (const unsafeUsername of ['-root', 'user name', 'user\nname', 'user`id`', 'user$(id)', 'user\\name']) {
            it(`rejects unsafe username ${JSON.stringify(unsafeUsername)} before running a command`, async function () {
                getTargetPlatformNameStub.resolves('Debian')
                getTestWindow().onDidShowInputBox((input) => input.acceptValue(unsafeUsername))
                await assert.rejects(client.getRemoteUser('testInstance'), { code: 'UnknownEc2User' })
                sinon.assert.notCalled(getCommandOutputStub)
            })
        }

        it('cancels when an unknown OS username is not selected', async function () {
            getTargetPlatformNameStub.resolves('Debian')
            getTestWindow().onDidShowInputBox((input) => input.hide())
            await assert.rejects(client.getRemoteUser('testInstance'), { code: 'UnknownEc2OS' })
        })
    })

    describe('tryCleanKeys', async function () {
        it('calls the sdk with the proper parameters', async function () {
            const sendCommandStub = sinon.stub(SsmClient.prototype, 'sendCommandAndWait')

            const testSelection = {
                instanceId: 'test-id',
                region: 'test-region',
            }

            await client.tryCleanKeys(testSelection.instanceId, 'hint', 'path/to/keys')
            sendCommandStub.calledWith(testSelection.instanceId, 'AWS-RunShellScript', {
                commands: [getRemoveLinesCommand('hint', 'path/to/keys')],
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

            await client.tryCleanKeys(testSelection.instanceId, 'hint', 'path/to/keys')
            sinon.assert.calledWith(sendCommandStub, testSelection.instanceId, 'AWS-RunShellScript', {
                commands: [getRemoveLinesCommand('hint', 'path/to/keys')],
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
        const lines = ['line1', 'line2 pattern', 'line3', 'line4 pattern', 'line5', 'line6 pattern', 'line7']
        const expected = ['line1', 'line3', 'line5', 'line7']

        const lineToStr = (ls: string[]) => ls.join('\n') + '\n'

        const textFile = path.join(tempPath.uri.fsPath, 'test.txt')
        const originalContent = lineToStr(lines)
        await fs.writeFile(textFile, originalContent)
        const command = getRemoveLinesCommand('pattern', textFile)
        const process = new ChildProcess('/bin/sh', ['-c', command], { collect: true })
        const result = await process.run()
        assert.strictEqual(result.exitCode, 0, `Ran command '${command}' and failed with result ${inspect(result)}`)

        const newContent = await fs.readFileText(textFile)
        assert.notStrictEqual(newContent, originalContent)
        assert.strictEqual(newContent, lineToStr(expected))
    })

    it('uses a portable backup suffix and quotes the path', async function () {
        assert.strictEqual(
            getRemoveLinesCommand('pattern', '/home/user name/.ssh/authorized_keys'),
            "sed -i.bak '/pattern/d' '/home/user name/.ssh/authorized_keys' && rm -f '/home/user name/.ssh/authorized_keys.bak'"
        )
    })

    it('throws when given invalid pattern', function () {
        assert.throws(() => getRemoveLinesCommand('pat/tern', 'test.txt'))
    })
})

function createRoleWithArn(Arn: string) {
    return {
        RoleName: 'hasArn',
        Arn,
        Path: 'thisIsAPath',
        RoleId: '1',
        CreateDate: new Date(),
    }
}
