/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from 'console'
import { ExternalBrowserUtils } from '../../../../amazonq/commons/externalBrowser/externalBrowserUtils'
import sinon from 'sinon'
import { getOpenExternalStub } from '../../../globalSetup.test'

describe('ExternalBrowserUtils', () => {
    let envStub: any

    beforeEach(() => {
        envStub = getOpenExternalStub()
        envStub.resolves(true)
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should open a link', () => {
        const link = 'https://www.example.com'

        ExternalBrowserUtils.instance.openLink(link)

        assert(envStub.calledOnce)
        assert(envStub.calledWith(link))
    })

    it('should return the same instance', () => {
        const instance1 = ExternalBrowserUtils.instance
        const instance2 = ExternalBrowserUtils.instance

        assert(instance1 === instance2)
    })
})
