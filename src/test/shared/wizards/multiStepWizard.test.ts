/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MultiStepWizard,
    WIZARD_RETRY,
    WIZARD_TERMINATE,
    WizardStep,
    wizardContinue,
    WIZARD_GOBACK,
    WizardNextState,
    Transition,
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

describe('run', function () {
    const mockWizard = new MockMultiStepWizard()
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('handles undefined starting step', async function () {
        sandbox.stub(mockWizard, 'startStep').value(undefined)

        await mockWizard.run()
    })

    it('handles undefined steps', async function () {
        const stub = sinon.stub()
        stub.returns({
            nextState: WizardNextState.CONTINUE,
            nextStep: undefined,
        } as Transition)
        sandbox.stub(mockWizard, 'startStep').value(stub)

        await mockWizard.run()
    })

    describe('terminate', function () {
        it('works when there are no more steps', async function () {
            const stub = sinon.stub()
            stub.returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(stub)

            await mockWizard.run()

            assert.strictEqual(stub.callCount, 1)
        })
    })

    describe('retry', function () {
        it('repeats current step', async function () {
            const stub = sinon.stub()
            stub.onFirstCall().returns(WIZARD_RETRY)
            stub.onSecondCall().returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(stub)

            await mockWizard.run()

            assert.strictEqual(stub.callCount, 2)
        })
    })

    describe('go back', function () {
        it('goes back', async function () {
            const step1 = sinon.stub()
            const step2 = sinon.stub()
            step1.returns(wizardContinue(step2))
            step2.onFirstCall().returns(WIZARD_GOBACK)
            step2.onSecondCall().returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(step1)
            await mockWizard.run()

            sinon.assert.callOrder(step1, step2, step1, step2)
        })

        it('handles branches', async function () {
            const step1 = sinon.stub()
            const branch1 = sinon.stub()
            const branch2 = sinon.stub()
            const step3 = sinon.stub()
            // step1 -> branch1 -> step1 -> branch2 -> step3 -> branch2 -> step3 -> terminate
            step1.onFirstCall().returns(wizardContinue(branch1))
            step1.onSecondCall().returns(wizardContinue(branch2))
            branch1.returns(WIZARD_GOBACK)
            branch2.returns(wizardContinue(step3))
            step3.onFirstCall().returns(WIZARD_GOBACK)
            step3.onSecondCall().returns(WIZARD_TERMINATE)
            sandbox.stub(mockWizard, 'startStep').value(step1)
            await mockWizard.run()

            sinon.assert.callOrder(step1, branch1, step1, branch2, step3, branch2, step3)
        })
    })

    describe('continue', function () {
        it('continues', async function () {
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
