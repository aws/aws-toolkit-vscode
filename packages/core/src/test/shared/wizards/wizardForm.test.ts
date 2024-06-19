/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { WizardForm } from '../../../shared/wizards/wizardForm'
import { SimplePrompter } from '../ui/prompter.test'
import { Wizard } from '../../../shared/wizards/wizard'

interface TestState {
    prop1: number
    prop2: string
    nestedProp: NestedTestState
}

interface NestedTestState {
    prop1?: string
    prop2?: string
}

describe('WizardForm', function () {
    let testWizard: Wizard<TestState>
    let testForm: Wizard<TestState>['form']
    let tester: WizardTester<TestState>

    beforeEach(async function () {
        testWizard = new Wizard()
        testForm = testWizard.form
        tester = await createWizardTester(testWizard)
    })

    it('can add prompter', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(0))
        tester.prop1.assertShow()
        assert.notStrictEqual(testWizard.boundForm.getPrompterProvider('prop1'), undefined)
    })

    it('uses relative order', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(0), { relativeOrder: 1 })
        testForm.prop2.bindPrompter(() => new SimplePrompter(''), { relativeOrder: 0 })

        tester.prop2.assertShowFirst()
        tester.prop1.assertShowSecond()
    })

    it('shows prompter based on context', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(0), { showWhen: state => state.prop2 === 'hello' })
        tester.prop1.assertDoesNotShow()
        tester.prop2.applyInput('hello')
        tester.prop1.assertShow()
        tester.prop2.applyInput('goodbye')
        tester.prop1.assertDoesNotShow()
    })

    it('applies default setting when field is not assigned', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(0), { setDefault: () => 100 })
        tester.prop1.assertShow()
        tester.prop1.assertValue(100)
        tester.prop1.applyInput(5)
        tester.prop1.assertDoesNotShow()
        tester.prop1.assertValue(5)
        tester.prop1.clearInput()
        tester.prop1.assertShow()
    })

    // TODO: revisit this. Values should not technically know about other field defaults
    // but allowing this behavior means loops are possible, so cycle detection would be needed
    it('default values do not depend on other default values', function () {
        testForm.prop1.setDefault(() => 100)
        testForm.prop2.setDefault(state => `default: ${state.prop1}`)
        tester.prop1.assertValue(100)
        tester.prop2.assertValue('default: undefined')
        tester.prop1.applyInput(50)
        tester.prop2.assertValue('default: 50')
    })

    describe('requireParent', function () {
        it('only show prompters when parent is defined', function () {
            testForm.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''), { requireParent: true })
            testForm.nestedProp.prop2.bindPrompter(() => new SimplePrompter(''))
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.prop2.assertShow()
            tester.nestedProp.applyInput({})
            tester.nestedProp.prop1.assertShow()
            tester.nestedProp.prop2.assertShow()
        })

        it('works with "showWhen"', function () {
            testForm.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''), {
                requireParent: true,
                showWhen: state => state.prop1 === 99,
            })
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.prop1.applyInput(99)
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.applyInput({})
            tester.nestedProp.prop1.assertShow()
            tester.prop1.applyInput(0)
            tester.nestedProp.prop1.assertDoesNotShow()
        })

        it('works with "setDefault"', function () {
            testForm.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''), {
                requireParent: true,
                setDefault: () => 'default',
            })
            tester.nestedProp.prop1.assertValue(undefined)
            tester.nestedProp.applyInput({})
            tester.nestedProp.prop1.assertValue('default')
            tester.nestedProp.prop1.applyInput('not default')
            tester.nestedProp.prop1.assertValue('not default')
        })
    })

    describe('addForm', function () {
        let nestedTestForm: WizardForm<NestedTestState>

        beforeEach(function () {
            nestedTestForm = new WizardForm()
        })

        it('handles providers with undefined parents', function () {
            testForm.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''))
            tester.nestedProp.prop1.assertShow()
        })

        it('can apply another form to a property', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''))
            testForm.nestedProp.applyBoundForm(nestedTestForm)
            tester.nestedProp.prop1.assertShow()
        })

        it('propagates state to local forms', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''), {
                showWhen: state => state.prop2 === 'hello',
            })
            testForm.nestedProp.applyBoundForm(nestedTestForm)
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.prop2.applyInput('hello')
            tester.nestedProp.prop1.assertShow()
        })

        it('can apply form with "requireParent"', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''), {
                showWhen: state => state.prop2 === 'hello',
            })
            nestedTestForm.body.prop2.setDefault(() => 'hello')
            testForm.nestedProp.applyBoundForm(nestedTestForm, { requireParent: true })
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.prop2.assertValue(undefined)
            tester.nestedProp.applyInput({})
            tester.nestedProp.prop1.assertShow()
        })

        it('can apply form with "showWhen"', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''), {
                showWhen: state => state.prop2 === 'hello',
            })
            nestedTestForm.body.prop2.bindPrompter(() => new SimplePrompter(''), {
                showWhen: state => state.prop1 === 'goodbye',
            })

            testForm.nestedProp.applyBoundForm(nestedTestForm, { showWhen: state => state.prop2 === 'start' })
            tester.nestedProp.assertDoesNotShowAny()
            tester.nestedProp.applyInput({})
            tester.nestedProp.assertDoesNotShowAny()
            tester.nestedProp.clearInput()
            tester.prop2.applyInput('start')
            tester.nestedProp.assertDoesNotShowAny()
            tester.nestedProp.prop1.applyInput('goodbye')
            tester.nestedProp.prop2.assertShow()
            tester.nestedProp.prop1.clearInput()
            tester.nestedProp.prop2.applyInput('hello')
            tester.nestedProp.prop1.assertShow()
        })
    })
})
