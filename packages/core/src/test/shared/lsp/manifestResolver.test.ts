/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { Manifest, ManifestResolver } from '../../../shared'
import { assertTelemetry } from '../../testUtil'
import { ManifestLocation } from '../../../shared/telemetry'

const manifestSchemaVersion = '1.0.0'
const serverName = 'myLS'

/**
 * Helper function generating valid manifest results for tests.
 * @param location
 * @returns
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
        assertTelemetry('languageServer_setup', {
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
        assertTelemetry('languageServer_setup', [
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
        assertTelemetry('languageServer_setup', [
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
})
