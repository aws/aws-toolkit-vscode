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
    isAmazonLinux2,
    isBeta,
    hasSageMakerEnvVars,
} from '../../../shared/vscode/env'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import * as sinon from 'sinon'
import os from 'os'
import fs from '../../../shared/fs/fs'
import vscode from 'vscode'
import { getComputeEnvType } from '../../../shared/telemetry/util'
import * as globals from '../../../shared/extensionGlobals'

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
            for (const v of envVars) {
                delete process.env[v]
            }
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

    describe('isAmazonLinux2', function () {
        let fsExistsStub: sinon.SinonStub
        let fsReadFileStub: sinon.SinonStub
        let isWebStub: sinon.SinonStub
        let platformStub: sinon.SinonStub
        let osReleaseStub: sinon.SinonStub
        let moduleLoadStub: sinon.SinonStub

        beforeEach(function () {
            // Default stubs
            platformStub = sandbox.stub(process, 'platform').value('linux')
            osReleaseStub = stubOsVersion('5.10.220-188.869.amzn2int.x86_64')
            isWebStub = sandbox.stub(globals, 'isWeb').returns(false)

            // Mock fs module
            const fsMock = {
                existsSync: sandbox.stub().returns(false),
                readFileSync: sandbox.stub().returns(''),
            }
            fsExistsStub = fsMock.existsSync
            fsReadFileStub = fsMock.readFileSync

            // Stub Module._load to intercept require calls
            const Module = require('module')
            moduleLoadStub = sandbox.stub(Module, '_load').callThrough()
            moduleLoadStub.withArgs('fs').returns(fsMock)
        })

        it('returns false in web environment', function () {
            isWebStub.returns(true)
            assert.strictEqual(isAmazonLinux2(), false)
        })

        it('returns false in SageMaker environment with SAGEMAKER_APP_TYPE', function () {
            const originalValue = process.env.SAGEMAKER_APP_TYPE
            process.env.SAGEMAKER_APP_TYPE = 'JupyterLab'
            try {
                assert.strictEqual(isAmazonLinux2(), false)
            } finally {
                if (originalValue === undefined) {
                    delete process.env.SAGEMAKER_APP_TYPE
                } else {
                    process.env.SAGEMAKER_APP_TYPE = originalValue
                }
            }
        })

        it('returns false in SageMaker environment with SM_APP_TYPE', function () {
            const originalValue = process.env.SM_APP_TYPE
            process.env.SM_APP_TYPE = 'JupyterLab'
            try {
                assert.strictEqual(isAmazonLinux2(), false)
            } finally {
                if (originalValue === undefined) {
                    delete process.env.SM_APP_TYPE
                } else {
                    process.env.SM_APP_TYPE = originalValue
                }
            }
        })

        it('returns false in SageMaker environment with SERVICE_NAME', function () {
            const originalValue = process.env.SERVICE_NAME
            process.env.SERVICE_NAME = 'SageMakerUnifiedStudio'
            try {
                assert.strictEqual(isAmazonLinux2(), false)
            } finally {
                if (originalValue === undefined) {
                    delete process.env.SERVICE_NAME
                } else {
                    process.env.SERVICE_NAME = originalValue
                }
            }
        })

        it('returns false when /etc/os-release indicates Ubuntu in container', function () {
            fsExistsStub.returns(true)
            fsReadFileStub.returns(`
NAME="Ubuntu"
VERSION="20.04.6 LTS (Focal Fossa)"
ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu 20.04.6 LTS"
VERSION_ID="20.04"
            `)

            // Even with AL2 kernel (host is AL2), should return false (container is Ubuntu)
            assert.strictEqual(isAmazonLinux2(), false)
        })

        it('returns false when /etc/os-release indicates Amazon Linux 2023', function () {
            fsExistsStub.returns(true)
            fsReadFileStub.returns(`
NAME="Amazon Linux"
VERSION="2023"
ID="amzn"
ID_LIKE="fedora"
VERSION_ID="2023"
PLATFORM_ID="platform:al2023"
PRETTY_NAME="Amazon Linux 2023"
            `)

            assert.strictEqual(isAmazonLinux2(), false)
        })

        it('returns true when /etc/os-release indicates Amazon Linux 2', function () {
            fsExistsStub.returns(true)
            fsReadFileStub.returns(`
NAME="Amazon Linux 2"
VERSION="2"
ID="amzn"
ID_LIKE="centos rhel fedora"
VERSION_ID="2"
PRETTY_NAME="Amazon Linux 2"
            `)

            assert.strictEqual(isAmazonLinux2(), true)
        })

        it('returns true when /etc/os-release has ID="amzn" and VERSION_ID="2"', function () {
            fsExistsStub.returns(true)
            fsReadFileStub.returns(`
NAME="Amazon Linux"
VERSION="2"
ID="amzn"
VERSION_ID="2"
            `)

            assert.strictEqual(isAmazonLinux2(), true)
        })

        it('returns false when /etc/os-release indicates CentOS', function () {
            fsExistsStub.returns(true)
            fsReadFileStub.returns(`
NAME="CentOS Linux"
VERSION="7 (Core)"
ID="centos"
ID_LIKE="rhel fedora"
VERSION_ID="7"
            `)

            // Even with AL2 kernel
            assert.strictEqual(isAmazonLinux2(), false)
        })

        it('falls back to kernel check when /etc/os-release does not exist', function () {
            fsExistsStub.returns(false)

            // Test with AL2 kernel
            assert.strictEqual(isAmazonLinux2(), true)

            // Test with non-AL2 kernel
            osReleaseStub.returns('5.10.220-188.869.NOT_INTERNAL.x86_64')
            assert.strictEqual(isAmazonLinux2(), false)
        })

        it('falls back to kernel check when /etc/os-release read fails', function () {
            fsExistsStub.returns(true)
            fsReadFileStub.throws(new Error('Permission denied'))

            // Should fall back to kernel check
            assert.strictEqual(isAmazonLinux2(), true)
        })

        it('returns true with .amzn2. kernel pattern', function () {
            fsExistsStub.returns(false)
            osReleaseStub.returns('5.10.236-227.928.amzn2.x86_64')
            assert.strictEqual(isAmazonLinux2(), true)
        })

        it('returns true with .amzn2int. kernel pattern', function () {
            fsExistsStub.returns(false)
            osReleaseStub.returns('5.10.220-188.869.amzn2int.x86_64')
            assert.strictEqual(isAmazonLinux2(), true)
        })

        it('returns false with non-AL2 kernel', function () {
            fsExistsStub.returns(false)
            osReleaseStub.returns('5.15.0-91-generic')
            assert.strictEqual(isAmazonLinux2(), false)
        })

        it('returns false on non-Linux platforms', function () {
            platformStub.value('darwin')
            fsExistsStub.returns(false)
            assert.strictEqual(isAmazonLinux2(), false)

            platformStub.value('win32')
            assert.strictEqual(isAmazonLinux2(), false)
        })

        it('returns false when container OS is different from host OS', function () {
            // Scenario: Host is AL2 (kernel shows AL2) but container is Ubuntu
            fsExistsStub.returns(true)
            fsReadFileStub.returns(`
NAME="Ubuntu"
VERSION="22.04"
ID=ubuntu
VERSION_ID="22.04"
            `)
            osReleaseStub.returns('5.10.220-188.869.amzn2int.x86_64') // AL2 kernel from host

            // Should trust container OS over kernel
            assert.strictEqual(isAmazonLinux2(), false)
        })
    })

    describe('hasSageMakerEnvVars', function () {
        afterEach(function () {
            // Clean up environment variables
            delete process.env.SAGEMAKER_APP_TYPE
            delete process.env.SAGEMAKER_INTERNAL_IMAGE_URI
            delete process.env.STUDIO_LOGGING_DIR
            delete process.env.SM_APP_TYPE
            delete process.env.SM_INTERNAL_IMAGE_URI
            delete process.env.SERVICE_NAME
        })

        it('returns true when SAGEMAKER_APP_TYPE is set', function () {
            process.env.SAGEMAKER_APP_TYPE = 'JupyterLab'
            assert.strictEqual(hasSageMakerEnvVars(), true)
        })

        it('returns true when SM_APP_TYPE is set', function () {
            process.env.SM_APP_TYPE = 'JupyterLab'
            assert.strictEqual(hasSageMakerEnvVars(), true)
        })

        it('returns true when SERVICE_NAME is SageMakerUnifiedStudio', function () {
            process.env.SERVICE_NAME = 'SageMakerUnifiedStudio'
            assert.strictEqual(hasSageMakerEnvVars(), true)
        })

        it('returns true when STUDIO_LOGGING_DIR contains /var/log/studio', function () {
            process.env.STUDIO_LOGGING_DIR = '/var/log/studio/logs'
            assert.strictEqual(hasSageMakerEnvVars(), true)
        })

        it('returns false when no SageMaker env vars are set', function () {
            assert.strictEqual(hasSageMakerEnvVars(), false)
        })

        it('returns false when SERVICE_NAME is set but not SageMakerUnifiedStudio', function () {
            process.env.SERVICE_NAME = 'SomeOtherService'
            assert.strictEqual(hasSageMakerEnvVars(), false)
        })
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
