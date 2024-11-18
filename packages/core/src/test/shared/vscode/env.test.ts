/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import path from 'path'
import {
    isCloudDesktop,
    getEnvVars,
    getServiceEnvVarConfig,
    isAmazonInternalOs as isAmazonInternalOS,
    isBeta,
} from '../../../shared/vscode/env'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import * as sinon from 'sinon'
import os from 'os'
import fs from '../../../shared/fs/fs'
import vscode from 'vscode'
import { getComputeEnvType } from '../../../shared/telemetry/util'

describe('env', function () {
    // create a sinon sandbox instance and instantiate in a beforeEach
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('getServiceEnvVarConfig', function () {
        const envVars: string[] = []

        afterEach(() => {
            envVars.forEach((v) => delete process.env[v])
            envVars.length = 0
        })

        function addEnvVar(k: string, v: string) {
            process.env[k] = v
            envVars.push(k)
        }

        it('gets service config', async function () {
            const service = 'codecatalyst'
            const serviceConfigs = ['region', 'endpoint', 'gitHostname']
            addEnvVar('__CODECATALYST_ENDPOINT', 'test.endpoint')
            addEnvVar('__CODECATALYST_GIT_HOSTNAME', 'test.gitHostname')

            const expectedConfig = {
                endpoint: 'test.endpoint',
                gitHostname: 'test.gitHostname',
            }
            assert.deepStrictEqual(getServiceEnvVarConfig(service, serviceConfigs), expectedConfig)
        })
    })

    describe('getEnvVars', function () {
        it('gets codecatalyst environment variables', async function () {
            const expectedEnvVars = {
                region: '__CODECATALYST_REGION',
                endpoint: '__CODECATALYST_ENDPOINT',
                hostname: '__CODECATALYST_HOSTNAME',
                gitHostname: '__CODECATALYST_GIT_HOSTNAME',
            }

            const envVar = getEnvVars('codecatalyst', Object.keys(expectedEnvVars))
            assert.deepStrictEqual(envVar, expectedEnvVars)
        })

        it('gets codewhisperer environment variables', async function () {
            const expectedEnvVars = {
                region: '__CODEWHISPERER_REGION',
                endpoint: '__CODEWHISPERER_ENDPOINT',
            }
            const envVar = getEnvVars('codewhisperer', Object.keys(expectedEnvVars))
            assert.deepStrictEqual(envVar, expectedEnvVars)
        })
    })

    function stubOsVersion(verson: string) {
        return sandbox.stub(os, 'release').returns(verson)
    }

    it('isBeta', async () => {
        // HACK: read each package.json because env.ts thinks version is "testPluginVersion" during testing.
        const toolkitPath = path.join(__dirname, '../../../../../../toolkit/package.json')
        const amazonqPath = path.join(__dirname, '../../../../../../amazonq/package.json')
        const toolkit = JSON.parse(await fs.readFileText(toolkitPath))
        const amazonq = JSON.parse(await fs.readFileText(amazonqPath))
        const toolkitVer = toolkit.version as string
        const amazonqVer = amazonq.version as string
        const toolkitBeta = toolkitVer.startsWith('99.')
        const amazonqBeta = amazonqVer.startsWith('99.')

        assert(toolkitBeta === amazonqBeta)
        const expected = toolkitBeta
        assert.strictEqual(isBeta(), expected)
    })

    it('isAmazonInternalOS', function () {
        sandbox.stub(process, 'platform').value('linux')
        const versionStub = stubOsVersion('5.10.220-188.869.amzn2int.x86_64')
        assert.strictEqual(isAmazonInternalOS(), true)

        versionStub.returns('5.10.220-188.869.NOT_INTERNAL.x86_64')
        assert.strictEqual(isAmazonInternalOS(), false)
    })

    it('isCloudDesktop', async function () {
        sandbox.stub(process, 'platform').value('linux')
        stubOsVersion('5.10.220-188.869.amzn2int.x86_64')

        const runStub = sandbox.stub(ChildProcess.prototype, 'run').resolves({ exitCode: 0 } as any)
        assert.strictEqual(await isCloudDesktop(), true)

        runStub.resolves({ exitCode: 1 } as any)
        assert.strictEqual(await isCloudDesktop(), false)
    })

    describe('getComputeEnvType', async function () {
        it('cloudDesktop', async function () {
            sandbox.stub(process, 'platform').value('linux')
            sandbox.stub(vscode.env, 'remoteName').value('ssh-remote')
            stubOsVersion('5.10.220-188.869.amzn2int.x86_64')
            sandbox.stub(ChildProcess.prototype, 'run').resolves({ exitCode: 0 } as any)

            assert.deepStrictEqual(await getComputeEnvType(), 'cloudDesktop-amzn')
        })

        it('ec2-internal', async function () {
            sandbox.stub(process, 'platform').value('linux')
            sandbox.stub(vscode.env, 'remoteName').value('ssh-remote')
            stubOsVersion('5.10.220-188.869.amzn2int.x86_64')
            sandbox.stub(ChildProcess.prototype, 'run').resolves({ exitCode: 1 } as any)

            assert.deepStrictEqual(await getComputeEnvType(), 'ec2-amzn')
        })

        it('ec2', async function () {
            sandbox.stub(process, 'platform').value('linux')
            sandbox.stub(vscode.env, 'remoteName').value('ssh-remote')
            stubOsVersion('5.10.220-188.869.NOT_INTERNAL.x86_64')

            assert.deepStrictEqual(await getComputeEnvType(), 'ec2')
        })
    })
})
