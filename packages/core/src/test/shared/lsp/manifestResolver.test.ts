/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import { ManifestResolver } from '../../../shared'
import { assertTelemetry } from '../../testUtil'

describe('manifestResolver telemetry', function () {
    let resolver: ManifestResolver
    let remoteFetchStub: sinon.SinonStub<any>
    let localFetchStub: sinon.SinonStub<any>

    before(function () {
        resolver = new ManifestResolver('https://example.com/manifest.json', 'test-server')
        remoteFetchStub = sinon.stub(ManifestResolver.prototype, 'fetchRemoteManifest' as any)
        localFetchStub = sinon.stub(ManifestResolver.prototype, 'getLocalManifest' as any)
    })

    after(function () {
        remoteFetchStub.restore()
        localFetchStub.restore()
    })
    it('emits when fetching from remote', async function () {
        remoteFetchStub.callsFake(() => {
            return Promise.resolve({})
        })
        await resolver.resolve()

        assertTelemetry('lsp_setup', { lspSetupStage: 'fetchManifest', lspSetupLocation: 'remote' })

        remoteFetchStub.restore()
    })

    it('emits when fetching from local cache', async function () {
        remoteFetchStub.callsFake(() => {
            throw new Error('nope')
        })
        localFetchStub.callsFake(() => {
            return Promise.resolve({})
        })
        await resolver.resolve()

        assertTelemetry('lsp_setup', { lspSetupStage: 'fetchManifest', lspSetupLocation: 'cache' })

        localFetchStub.restore()
    })
})
