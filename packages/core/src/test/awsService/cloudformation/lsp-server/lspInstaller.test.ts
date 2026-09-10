/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as path from 'path'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import {
    CfnLspInstaller,
    CfnManifestAdapter,
    cfnInstallerConfig,
    determineEnvironment,
    withExecutableBits,
} from '../../../../awsService/cloudformation/lsp-server/lspInstaller'
import { CfnLspServerFile } from '../../../../awsService/cloudformation/lsp-server/lspServerConfig'
import * as env from '../../../../shared/vscode/env'
import { fs } from '../../../../shared/fs/fs'
import globals from '../../../../shared/extensionGlobals'
import { TempTestDir } from '../../../shared/lsp/lspTestFixtures'

describe('CloudFormation LSP determineEnvironment', function () {
    let sandbox: sinon.SinonSandbox
    const originalOverride = process.env.CFN_LSP_ENVIRONMENT

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        delete process.env.CFN_LSP_ENVIRONMENT
    })

    afterEach(function () {
        sandbox.restore()
        if (originalOverride === undefined) {
            delete process.env.CFN_LSP_ENVIRONMENT
        } else {
            process.env.CFN_LSP_ENVIRONMENT = originalOverride
        }
    })

    it('explicit CFN_LSP_ENVIRONMENT overrides automatic detection', function () {
        sandbox.stub(env, 'isAutomation').returns(true)
        process.env.CFN_LSP_ENVIRONMENT = 'prod'
        assert.strictEqual(determineEnvironment(), 'prod')
    })

    it('trims and lowercases the override value', function () {
        sandbox.stub(env, 'isAutomation').returns(false)
        process.env.CFN_LSP_ENVIRONMENT = '  BeTa  '
        assert.strictEqual(determineEnvironment(), 'beta')
    })

    it('reaches alpha only through an explicit override', function () {
        sandbox.stub(env, 'isAutomation').returns(false)
        process.env.CFN_LSP_ENVIRONMENT = 'alpha'
        assert.strictEqual(determineEnvironment(), 'alpha')
    })

    it('falls through to automatic detection on an invalid override', function () {
        sandbox.stub(env, 'isAutomation').returns(false)
        process.env.CFN_LSP_ENVIRONMENT = 'not-a-channel'
        assert.strictEqual(determineEnvironment(), 'prod')
    })

    it('automatic channel is beta for automation', function () {
        sandbox.stub(env, 'isAutomation').returns(true)
        assert.strictEqual(determineEnvironment(), 'beta')
    })

    it('automatic channel is prod otherwise', function () {
        sandbox.stub(env, 'isAutomation').returns(false)
        assert.strictEqual(determineEnvironment(), 'prod')
    })
})

describe('cfnInstallerConfig', function () {
    const originalBundle = process.env.CFN_LSP_BUNDLE

    afterEach(function () {
        if (originalBundle === undefined) {
            delete process.env.CFN_LSP_BUNDLE
        } else {
            process.env.CFN_LSP_BUNDLE = originalBundle
        }
    })

    it('matches the CloudFormation LSP parity contract', function () {
        delete process.env.CFN_LSP_BUNDLE
        const config = cfnInstallerConfig()

        assert.strictEqual(config.name, 'cloudformation-languageserver')
        assert.strictEqual(config.supportedVersionRange, '<2.0.0')
        assert.strictEqual(config.serverFilename, 'cfn-lsp-server-standalone.js')
        assert.deepStrictEqual(config.requiredFiles, ['bin', 'node_modules'])
        assert.strictEqual(config.localBundleRoot, undefined)
        assert.ok(
            config.storageDir.endsWith(path.join('aws', 'language-servers', 'cloudformation-languageserver')),
            `unexpected storageDir: ${config.storageDir}`
        )
        assert.ok(!config.storageDir.includes(path.join('aws', 'toolkits')), 'storageDir must not contain toolkits')
    })

    it('names the exact storageDir when provided', function () {
        const config = cfnInstallerConfig({ storageDir: path.join('/custom', 'cfn') })
        assert.strictEqual(config.storageDir, path.join('/custom', 'cfn'))
    })

    it('sets localBundleRoot from a trimmed CFN_LSP_BUNDLE', function () {
        process.env.CFN_LSP_BUNDLE = '  /opt/cfn-bundle  '
        assert.strictEqual(cfnInstallerConfig().localBundleRoot, '/opt/cfn-bundle')
    })

    it('leaves localBundleRoot undefined when CFN_LSP_BUNDLE is blank', function () {
        process.env.CFN_LSP_BUNDLE = '   '
        assert.strictEqual(cfnInstallerConfig().localBundleRoot, undefined)
    })
})

describe('CfnManifestAdapter', function () {
    const channelKeyed = {
        manifestSchemaVersion: '2.0',
        alpha: [{ serverVersion: '1.0.0-alpha', isDelisted: false, targets: [] }],
        prod: [
            { serverVersion: '1.0.0', isDelisted: false, targets: [] },
            { serverVersion: '1.1.0', isDelisted: false, targets: [] },
        ],
    }

    it('selects the requested channel array', function () {
        const manifest = new CfnManifestAdapter('prod').adapt(channelKeyed)
        assert.strictEqual(manifest.versions.length, 2)
        assert.strictEqual(manifest.versions[0].serverVersion, '1.0.0')
    })

    it('requires the requested channel array (no top-level versions fallback)', function () {
        const flat = {
            manifestSchemaVersion: '1.0',
            versions: [{ serverVersion: '9.9.9', isDelisted: false, targets: [] }],
        }
        assert.throws(() => new CfnManifestAdapter('prod').adapt(flat), /no versions for environment 'prod'/)
    })

    it('throws when the requested channel is absent', function () {
        assert.throws(() => new CfnManifestAdapter('beta').adapt(channelKeyed), /no versions for environment 'beta'/)
    })
})

describe('CfnLspInstaller.resourcePaths', function () {
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    function installer(): CfnLspInstaller {
        return new CfnLspInstaller({ storageDir: tmpDir.path })
    }

    it('resolves a direct-root server layout', async function () {
        const assetDir = path.join(tmpDir.path, 'asset-direct')
        await fs.mkdir(assetDir)
        await fs.writeFile(path.join(assetDir, CfnLspServerFile), 'server')

        const paths = (installer() as any).resourcePaths(assetDir)
        assert.strictEqual(paths.lsp, path.join(assetDir, CfnLspServerFile))
    })

    it('resolves a one-level nested server layout', async function () {
        const assetDir = path.join(tmpDir.path, 'asset-nested')
        const bundleDir = path.join(assetDir, 'server-1.0.0')
        await fs.mkdir(bundleDir)
        await fs.writeFile(path.join(bundleDir, CfnLspServerFile), 'server')

        const paths = (installer() as any).resourcePaths(assetDir)
        assert.strictEqual(paths.lsp, path.join(bundleDir, CfnLspServerFile))
    })

    it('throws when no candidate directory contains the server file', async function () {
        const assetDir = path.join(tmpDir.path, 'asset-empty')
        await fs.mkdir(path.join(assetDir, 'child-a'))
        await fs.mkdir(path.join(assetDir, 'child-b'))

        assert.throws(() => (installer() as any).resourcePaths(assetDir), /server file not found/)
    })

    it('follows a nested directory symlink when locating the server (Files.isDirectory parity)', async function () {
        if (process.platform === 'win32') {
            this.skip()
        }
        const realBundle = path.join(tmpDir.path, 'real-bundle')
        await fs.mkdir(realBundle)
        await fs.writeFile(path.join(realBundle, CfnLspServerFile), 'server')

        const assetDir = path.join(tmpDir.path, 'asset-symlink')
        await fs.mkdir(assetDir)
        nodeFs.symlinkSync(realBundle, path.join(assetDir, 'linked-bundle'))

        const paths = (installer() as any).resourcePaths(assetDir)
        assert.strictEqual(paths.lsp, path.join(assetDir, 'linked-bundle', CfnLspServerFile))
    })
})

describe('CfnLspInstaller.postInstall (cfn-init chmod)', function () {
    let sandbox: sinon.SinonSandbox
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        await tmpDir.setup()
    })

    afterEach(async function () {
        sandbox.restore()
        await tmpDir.teardown()
    })

    async function makeBundle(): Promise<string> {
        const assetDir = path.join(tmpDir.path, 'asset')
        const bundleDir = path.join(assetDir, 'server-1.0.0')
        await fs.mkdir(path.join(bundleDir, 'bin'))
        await fs.writeFile(path.join(bundleDir, CfnLspServerFile), 'server')
        await fs.writeFile(path.join(bundleDir, 'bin', 'cfn-init'), '#!/bin/sh')
        return assetDir
    }

    it('skips chmod entirely on Windows', async function () {
        sandbox.stub(process, 'platform').value('win32')
        const chmodStub = sandbox.stub(fs, 'chmod').resolves()
        const assetDir = await makeBundle()

        await (new CfnLspInstaller({ storageDir: tmpDir.path }) as any).postInstall(assetDir)

        assert.strictEqual(chmodStub.called, false)
    })

    it('is best-effort: a chmod failure does not fail the install', async function () {
        sandbox.stub(process, 'platform').value('linux')
        sandbox.stub(fs, 'chmod').rejects(new Error('EPERM'))
        const assetDir = await makeBundle()

        await assert.doesNotReject((new CfnLspInstaller({ storageDir: tmpDir.path }) as any).postInstall(assetDir))
    })

    it('chmods the cfn-init binary on non-Windows platforms', async function () {
        sandbox.stub(process, 'platform').value('linux')
        const chmodStub = sandbox.stub(fs, 'chmod').resolves()
        const assetDir = await makeBundle()

        await (new CfnLspInstaller({ storageDir: tmpDir.path }) as any).postInstall(assetDir)

        assert.strictEqual(chmodStub.calledOnce, true)
        assert.ok((chmodStub.firstCall.args[0] as string).endsWith(path.join('bin', 'cfn-init')))
    })

    it('preserves read/write bits and adds execute bits from a controlled starting mode', async function () {
        if (process.platform === 'win32') {
            this.skip()
        }
        sandbox.stub(process, 'platform').value('linux')
        const assetDir = await makeBundle()
        const cfnInit = path.join(assetDir, 'server-1.0.0', 'bin', 'cfn-init')
        await fs.chmod(cfnInit, 0o640)

        await (new CfnLspInstaller({ storageDir: tmpDir.path }) as any).postInstall(assetDir)

        assert.strictEqual(nodeFs.statSync(cfnInit).mode & 0o777, 0o751)
    })
})

describe('withExecutableBits', function () {
    it('adds execute for owner/group/others while preserving read/write bits', function () {
        assert.strictEqual(withExecutableBits(0o644), 0o755)
        assert.strictEqual(withExecutableBits(0o640), 0o751)
        assert.strictEqual(withExecutableBits(0o600), 0o711)
    })

    it('is idempotent when execute bits are already set', function () {
        assert.strictEqual(withExecutableBits(0o755), 0o755)
    })

    it('drops file-type bits reported by stat() so only permission bits reach chmod', function () {
        assert.strictEqual(withExecutableBits(0o100644), 0o755)
    })
})

describe('CfnLspInstaller.cleanupAfterResolveWithLegacy', function () {
    let sandbox: sinon.SinonSandbox
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        await tmpDir.setup()
    })

    afterEach(async function () {
        sandbox.restore()
        await tmpDir.teardown()
    })

    it('invokes the legacy-location hook and then post-resolve cleanup', async function () {
        const inst = new CfnLspInstaller({ storageDir: tmpDir.path })
        const legacyStub = sandbox.stub(inst as any, 'cleanupLegacyStorageDir')
        const cleanupStub = sandbox.stub(inst, 'cleanupAfterResolve').resolves()

        await inst.cleanupAfterResolveWithLegacy()

        assert.ok(legacyStub.calledOnce, 'legacy-location hook must run')
        assert.ok(cleanupStub.calledOnce, 'post-resolve cleanup must run')
        assert.ok(legacyStub.calledBefore(cleanupStub), 'legacy hook runs before post-resolve cleanup')
    })

    it('clears the legacy globalState manifest cache', async function () {
        await globals.globalState.update('aws.cloudformation.lsp.manifest', { content: '{}' })
        const inst = new CfnLspInstaller({ storageDir: tmpDir.path })
        sandbox.stub(inst, 'cleanupAfterResolve').resolves()

        await inst.cleanupAfterResolveWithLegacy()

        assert.strictEqual(globals.globalState.get('aws.cloudformation.lsp.manifest'), undefined)
    })
})
