/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import * as customizationModule from '../../../src/codewhisperer/util/customizationUtil'

describe('getNewCustomizations', () => {
    let getPersistedCustomizationsStub: sinon.SinonStub

    const availableCustomizations = [
        { arn: 'arn1', name: 'custom1' },
        { arn: 'arn2', name: 'custom2' },
    ]

    const persistedCustomizations = [[{ arn: 'arn1', name: 'custom1' }], [{ arn: 'arn2', name: 'custom2' }]]

    beforeEach(() => {
        getPersistedCustomizationsStub = sinon.stub(customizationModule, 'getPersistedCustomizations')
    })

    afterEach(() => {
        sinon.restore()
    })

    it('returns new customizations that are not in persisted customizations', () => {
        const customizations = [...availableCustomizations, { arn: 'arn3', name: 'custom3' }]

        getPersistedCustomizationsStub.returns(persistedCustomizations)

        const result = customizationModule.getNewCustomizations(customizations)

        assert.deepEqual(result, [{ arn: 'arn3', name: 'custom3' }])
        sinon.assert.calledOnce(getPersistedCustomizationsStub)
    })

    it('returns empty array when all available customizations are persisted', () => {
        getPersistedCustomizationsStub.returns(persistedCustomizations)

        const result = customizationModule.getNewCustomizations(availableCustomizations)

        assert.deepEqual(result.length, 0)
        sinon.assert.calledOnce(getPersistedCustomizationsStub)
    })
})
