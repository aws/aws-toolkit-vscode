/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */


import { Wizard, WIZARD_EXIT } from "../../../shared/wizards/wizard"
import * as assert from 'assert'
//import { initializeInterface } from '../../../shared/transformers'
import { MockPrompter } from "./wizardFramework"

interface TestWizardForm {
    prop1: string
    prop2?: number
    prop3: string
    nestedProp: {
        prop1: string
        prop2: boolean
    }
}

class TestWizard extends Wizard<TestWizardForm> {
    constructor() {
        super({ nestedProp: {} })
    }
}

describe('Wizard', function () {
    it('Binds prompter to property', async function() {
        const wizard = new TestWizard()
        wizard.form.prop1.bindPrompter(() => new MockPrompter('hello'))
        const result = await wizard.run()
        assert.strictEqual(result?.prop1, 'hello')
    })

    it('Shows prompter based on context', async function() {
        const wizard = new TestWizard()
        wizard.form.prop1.bindPrompter(() => new MockPrompter('hello'))
        wizard.form.prop2.bindPrompter(() => new MockPrompter(123), {
            showWhen: form => form.prop1 === 'goodbye'
        })
        wizard.form.prop3.bindPrompter(() => new MockPrompter('howdy'), {
            showWhen: form => form.prop1 === 'hello'
        })
        const result = await wizard.run()
        assert.strictEqual(result?.prop1, 'hello')
        assert.strictEqual(result?.prop2, undefined)
        assert.strictEqual(result?.prop3, 'howdy')
    })

    it('Applies defaults when prompter is not shown', async function() {
        const wizard = new TestWizard()
        wizard.form.prop2.bindPrompter(() => new MockPrompter(123), {
            showWhen: form => form.prop1 === 'goodbye',
            setDefault: () => 999
        })
        const result = await wizard.run()
        assert.strictEqual(result?.prop2, 999)
    })

    it('Defaults are not used when the prompter is shown', async function() {
        const wizard = new TestWizard()
        wizard.form.prop1.bindPrompter(() => new MockPrompter('goodbye'))
        wizard.form.prop2.bindPrompter(() => new MockPrompter(123), {
            showWhen: form => form.prop1 === 'goodbye',
            setDefault: () => 999
        })
        const result = await wizard.run()
        assert.strictEqual(result?.prop2, 123)
    })

    it('Defaults propagate to other prompter providers and contexts', async function() {
        const wizard = new TestWizard()
        wizard.form.prop1.bindPrompter(() => new MockPrompter('hello'))
        wizard.form.prop3.bindPrompter(form => new MockPrompter(`howdy ${form.prop2}`), {
            showWhen: form => form.prop2 !== undefined
        })
        wizard.form.prop2.bindPrompter(() => new MockPrompter(123), {
            showWhen: form => form.prop1 === 'goodbye',
            setDefault: () => 999
        })
        const result = await wizard.run()
        assert.strictEqual(result?.prop1, 'hello')
        assert.strictEqual(result?.prop2, 999)
        assert.strictEqual(result?.prop3, 'howdy 999')
    })

    it('Processes signals', async function() {
        const wizard = new TestWizard()
        wizard.form.prop1.bindPrompter(() => new MockPrompter('hello'))
        wizard.form.prop3.bindPrompter(() => new MockPrompter<string>(WIZARD_EXIT))
        assert.strictEqual(await wizard.run(), undefined)
    })
})
