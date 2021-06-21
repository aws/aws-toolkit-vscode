/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */


import * as assert from 'assert'
import * as sinon from 'sinon'
import { Wizard, WIZARD_BACK, WIZARD_EXIT } from "../../../shared/wizards/wizard"
import { MockPrompter } from "../ui/prompter.test"

interface TestWizardForm {
    prop1: string
    prop2?: number
    prop3: string
    nestedProp: {
        prop1: string
        prop2: boolean
    }
}

// We only need to test execution of prompters provided by the wizard form

describe('Wizard', function () {
    const sandbox = sinon.createSandbox()

    let wizard: Wizard<TestWizardForm>
    let helloStub: sinon.SinonStub<any[], any> // we use this to make assertions about call count

    beforeEach(function () {
        wizard = new Wizard()
        helloStub = sandbox.stub().callsFake(() => new MockPrompter('hello'))
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('Binds prompter to property', async function() {
        wizard.form.prop1.bindPrompter(() => new MockPrompter('hello'))
        const result = await wizard.run()
        assert.strictEqual(result?.prop1, 'hello')
    })

    it('Processes exit signal', async function() {
        wizard.form.prop1.bindPrompter(helloStub)
        wizard.form.prop3.bindPrompter(() => new MockPrompter<string>(WIZARD_EXIT))
        assert.strictEqual(await wizard.run(), undefined)
        assert.ok(helloStub.calledOnce)
    })

    // test is mostly redundant (state controller handles this logic) but good to have
    it('Regenerates prompters when going back', async function() {
        const backStub = sandbox.stub()
        backStub.onFirstCall().callsFake(() => new MockPrompter<string>(WIZARD_BACK))
        backStub.onSecondCall().callsFake(() => new MockPrompter('goodbye'))
        wizard.form.prop1.bindPrompter(helloStub)
        wizard.form.prop3.bindPrompter(backStub)
        assert.deepStrictEqual(await wizard.run(), { prop1: 'hello', prop3: 'goodbye'})
        assert.ok(helloStub.calledTwice)
        assert.ok(backStub.calledTwice)
    })

    describe('Steps', function () {
        // Test step logic here (will do after adding another thing to test utils)
    })
})
