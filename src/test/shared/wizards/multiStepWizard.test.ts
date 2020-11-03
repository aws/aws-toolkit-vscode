/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MultiStepWizard,
    WIZARD_REPROMPT,
    WIZARD_TERMINATE,
    WizardStep,
    wizardContinue,
    WIZARD_GOBACK,
} from '../../../shared/wizards/multiStepWizard'
import * as sinon from 'sinon'
import assert = require('assert')

class MockMultiStepWizard extends MultiStepWizard<undefined> {
    public constructor() {
        super()
    }

    public get startStep(): WizardStep {
        return async () => {
            return WIZARD_TERMINATE
        }
    }

    protected getResult(): undefined {
        return undefined
    }
}

describe('run', () => {
    const mockWizard = new MockMultiStepWizard()
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('terminate', () => {
        it('works when there are no more steps', async () => {
            const stub = sinon.stub()
            stub.returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(stub)

            await mockWizard.run()

            assert.strictEqual(stub.callCount, 1)
        })
    })

    describe('re-prompt', () => {
        it('repeats current step', async () => {
            const stub = sinon.stub()
            stub.onFirstCall().returns(WIZARD_REPROMPT)
            stub.onSecondCall().returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(stub)

            await mockWizard.run()

            assert.strictEqual(stub.callCount, 2)
        })
    })

    describe('go back', () => {
        it('goes back', async () => {
            const step1 = sinon.stub()
            const step2 = sinon.stub()
            step1.returns(wizardContinue(step2))
            step2.onFirstCall().returns(WIZARD_GOBACK)
            step2.onSecondCall().returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(step1)
            await mockWizard.run()

            sinon.assert.callOrder(step1, step2, step1, step2)
        })

        it('handles branches', async () => {
            const step1 = sinon.stub()
            const branch1 = sinon.stub()
            const branch2 = sinon.stub()
            const step3 = sinon.stub()
            step1.onFirstCall().returns(wizardContinue(branch1))
            step1.onSecondCall().returns(wizardContinue(branch2))
            branch1.returns(WIZARD_GOBACK)
            branch2.returns(wizardContinue(step3))
            step3.onFirstCall().returns(WIZARD_GOBACK)
            step3.onSecondCall().returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(step1)
            await mockWizard.run()

            // step1 -> branch1 -> step1 -> branch2 -> step3 -> branch2 -> step3 -> terminate
            sinon.assert.callOrder(step1, branch1, step1, branch2, step3, branch2, step3)
        })
    })

    describe('continue', () => {
        it('continues', async () => {
            const step1 = sinon.stub()
            const step2 = sinon.stub()
            step1.returns(wizardContinue(step2))
            step2.returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(step1)
            await mockWizard.run()

            sinon.assert.callOrder(step1, step2)
        })
    })
})
