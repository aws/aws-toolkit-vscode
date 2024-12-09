/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { SafeEc2Instance } from '../../../shared/clients/ec2Client'
import { getIconCode, getRemoveLinesCommand } from '../../../awsService/ec2/utils'
import { DefaultAwsContext, globals } from '../../../shared'
import { fs } from '../../../shared/fs/fs'
import { createTestWorkspaceFolder } from '../../testUtil'
import path from 'path'
import { ChildProcess } from '../../../shared/utilities/processUtils'

describe('utils', async function () {
    before(function () {
        sinon.stub(DefaultAwsContext.prototype, 'getCredentialAccountId')
    })

    after(function () {
        sinon.restore()
    })

    describe('getIconCode', function () {
        it('gives code based on status', function () {
            const runningInstance: SafeEc2Instance = {
                InstanceId: 'X',
                LastSeenStatus: 'running',
            }
            const stoppedInstance: SafeEc2Instance = {
                InstanceId: 'XX',
                LastSeenStatus: 'stopped',
            }
            const terminatedInstance: SafeEc2Instance = {
                InstanceId: 'XXX',
                LastSeenStatus: 'terminated',
            }

            assert.strictEqual(getIconCode(runningInstance), 'pass')
            assert.strictEqual(getIconCode(stoppedInstance), 'circle-slash')
            assert.strictEqual(getIconCode(terminatedInstance), 'stop')
        })

        it('defaults to loading~spin', function () {
            const pendingInstance: SafeEc2Instance = {
                InstanceId: 'X',
                LastSeenStatus: 'pending',
            }
            const stoppingInstance: SafeEc2Instance = {
                InstanceId: 'XX',
                LastSeenStatus: 'shutting-down',
            }

            assert.strictEqual(getIconCode(pendingInstance), 'loading~spin')
            assert.strictEqual(getIconCode(stoppingInstance), 'loading~spin')
        })
    })

    describe('getRemoveLinesCommand', async function () {
        it('removes lines prefixed by pattern', async function () {
            const pattern = 'pattern'
            const lines = ['line1', 'line2 pattern', 'line3', 'line4 pattern', 'line5', 'line6 pattern', 'line7']
            const expected = ['line1', 'line3', 'line5', 'line7']
            const tempPath = await createTestWorkspaceFolder()
            const textFile = path.join(tempPath.uri.fsPath, 'test.txt')
            await fs.writeFile(textFile, lines.join('\n'))

            const [command, ...args] = getRemoveLinesCommand(pattern, textFile).split(' ')
            const process = new ChildProcess(command, args, { collect: true })
            const result = await process.run()

            assert.strictEqual(result.exitCode, 0, `ChildProcess failed with error=${result.error}`)
            const newContent = await fs.readFileText(textFile)

            assert.strictEqual(newContent, expected.join('\n') + '\n')
            await fs.delete(tempPath.uri.fsPath, { recursive: true, force: true })
        })
    })
})
