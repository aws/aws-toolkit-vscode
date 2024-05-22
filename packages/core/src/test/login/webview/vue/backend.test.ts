/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { assertTelemetry, tryRegister } from '../../../testUtil'
import { AmazonQLoginWebview } from '../../../../login/webview/vue/amazonq/backend_amazonq'
import { openAmazonQWalkthrough } from '../../../../amazonq/onboardingPage/walkthrough'
import { CancellationError } from '../../../../shared/utilities/timeoutUtils'
import { TelemetryMetadata } from '../../../../login/webview/vue/types'

// TODO: remove auth page and tests
describe('Amazon Q Login', function () {
    const region = 'fakeRegion'
    const startUrl = 'fakeUrl'

    let backend: AmazonQLoginWebview

    before(function () {
        tryRegister(openAmazonQWalkthrough)
    })

    beforeEach(function () {
        backend = new AmazonQLoginWebview()
    })

    it('emits ui_click telemetry', function () {
        backend.emitUiClick('auth_backButton')

        assertTelemetry('ui_click', {
            elementId: 'auth_backButton',
        })
    })

    it('runs setup and emits success and recorded metrics', async function () {
        const metadata: TelemetryMetadata = {
            credentialSourceId: 'iamIdentityCenter',
            credentialStartUrl: startUrl,
            awsRegion: region,
        }
        const setupFunc = async () => {
            backend.storeMetricMetadata(metadata)
        }

        // method under test
        await backend.ssoSetup('test', setupFunc, true)

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            ...metadata,
        })
    })

    it('runs setup and emits success and recorded metrics', async function () {
        const metadata: TelemetryMetadata = {
            credentialSourceId: 'iamIdentityCenter',
            credentialStartUrl: startUrl,
            awsRegion: region,
        }
        const setupFunc = async () => {
            backend.storeMetricMetadata(metadata)
            throw new Error('error')
        }

        // method under test
        await backend.ssoSetup('test', setupFunc, true)

        assertTelemetry('auth_addConnection', {
            result: 'Failed',
            ...metadata,
        })
    })

    it('runs setup and emits cancelled and recorded metrics', async function () {
        const metadata: TelemetryMetadata = {
            credentialSourceId: 'iamIdentityCenter',
            credentialStartUrl: startUrl,
            awsRegion: region,
        }
        const setupFunc = async () => {
            backend.storeMetricMetadata(metadata)
            throw new CancellationError('user')
        }

        // method under test
        await backend.ssoSetup('test', setupFunc, true)

        assertTelemetry('auth_addConnection', {
            result: 'Cancelled',
            ...metadata,
        })
    })
})
