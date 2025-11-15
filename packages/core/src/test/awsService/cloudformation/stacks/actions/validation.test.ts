/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import {
    getLastValidation,
    setLastValidation,
} from '../../../../../awsService/cloudformation/stacks/actions/validationWorkflow'

describe('Validation', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('last validation tracking', function () {
        it('should get and set last validation', function () {
            assert.strictEqual(getLastValidation(), undefined)

            const validation: any = { templateUri: 'test.yaml', stackName: 'test-stack' }
            setLastValidation(validation)
            assert.strictEqual(getLastValidation(), validation)

            setLastValidation(undefined)
            assert.strictEqual(getLastValidation(), undefined)
        })
    })
})
