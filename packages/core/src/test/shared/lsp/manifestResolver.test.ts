/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { Manifest, ManifestResolver } from '../../../shared'
import { getMetrics, partialDeepCompare } from '../../testUtil'
import { ManifestLocation } from '../../../shared/telemetry'

const manifestSchemaVersion = '1.0.0'
const serverName = 'myLS'

/**
 * Helper function generating valid manifest results for tests.
 */
function manifestResult(location: ManifestLocation): Manifest {
    return {
        location,
        manifestSchemaVersion,
        artifactId: 'artifact-id',
        artifactDescription: 'artifact-description',
        isManifestDeprecated: false,
        versions: [],
    }
}

function assertServerTelemetry(expected: Record<string, unknown> | Record<string, unknown>[]): void {
    const expectedMetrics = Array.isArray(expected) ? expected : [expected]
    const actualMetrics = getMetrics('languageServer_setup').filter((metric) => metric.id === serverName)
    assert.ok(actualMetrics.length >= expectedMetrics.length)
    for (const [index, metric] of expectedMetrics.entries()) {
        partialDeepCompare(actualMetrics[index], metric)
    }
}

describe('manifestResolver', function () {
    let remoteStub: sinon.SinonStub
    let localStub: sinon.SinonStub

    before(function () {
        remoteStub = sinon.stub(ManifestResolver.prototype, 'fetchRemoteManifest' as any)
        localStub = sinon.stub(ManifestResolver.prototype, 'getLocalManifest' as any)
    })

    after(function () {
        sinon.restore()
    })

    it('attempts to fetch from remote first', async function () {
        remoteStub.resolves(manifestResult('remote'))

        const r = await new ManifestResolver('remote-manifest.com', serverName, '').resolve()
        assert.strictEqual(r.location, 'remote')
        assertServerTelemetry({
            manifestLocation: 'remote',
            manifestSchemaVersion,
            languageServerSetupStage: 'getManifest',
            id: serverName,
            result: 'Succeeded',
        })
    })

    it('uses local cache when remote fails', async function () {
        remoteStub.rejects(new Error('failed to fetch'))
        localStub.resolves(manifestResult('cache'))

        const r = await new ManifestResolver('remote-manifest.com', serverName, '').resolve()
        assert.strictEqual(r.location, 'cache')
        assertServerTelemetry([
            {
                manifestLocation: 'remote',
                languageServerSetupStage: 'getManifest',
                id: serverName,
                result: 'Failed',
            },
            {
                manifestLocation: 'cache',
                manifestSchemaVersion,
                languageServerSetupStage: 'getManifest',
                id: serverName,
                result: 'Succeeded',
            },
        ])
    })

    it('fails if both local and remote fail', async function () {
        remoteStub.rejects(new Error('failed to fetch'))
        localStub.rejects(new Error('failed to fetch'))

        await assert.rejects(new ManifestResolver('remote-manifest.com', serverName, '').resolve(), /failed to fetch/)
        assertServerTelemetry([
            {
                manifestLocation: 'remote',
                languageServerSetupStage: 'getManifest',
                id: serverName,
                result: 'Failed',
            },
            {
                manifestLocation: 'cache',
                languageServerSetupStage: 'getManifest',
                id: serverName,
                result: 'Failed',
            },
        ])
    })

    it('accepts config object constructor', async function () {
        remoteStub.resolves(manifestResult('remote'))

        const r = await new ManifestResolver({
            manifestUrl: 'https://example.com/manifest.json',
            lsName: serverName,
            cacheDir: '/tmp/test-cache',
        }).resolve()
        assert.strictEqual(r.location, 'remote')
    })
})
