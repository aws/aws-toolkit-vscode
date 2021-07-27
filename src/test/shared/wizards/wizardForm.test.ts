/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createFormTester, FormTester } from '../../shared/wizards/wizardTestUtils'
import { WizardForm } from '../../../shared/wizards/wizardForm'
import { SimplePrompter } from '../ui/prompter.test'

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
    let testForm: WizardForm<TestState>
    let tester: FormTester<TestState>

    beforeEach(function () {
        testForm = new WizardForm()
        tester = createFormTester(testForm)
    })

    it('can add prompter', function () {
        testForm.body.prop1.bindPrompter(() => new SimplePrompter(0))
        tester.prop1.assertShow()
        assert.notStrictEqual(testForm.getPrompterProvider('prop1'), undefined)
    })

    it('shows prompter based on context', function () {
        testForm.body.prop1.bindPrompter(() => new SimplePrompter(0), { showWhen: state => state.prop2 === 'hello' })
        tester.prop1.assertDoesNotShow()
        tester.prop2.applyInput('hello')
        tester.prop1.assertShow()
        tester.prop2.applyInput('goodbye')
        tester.prop1.assertDoesNotShow()
    })

    it('applies default setting when field is not assigned', function () {
        testForm.body.prop1.bindPrompter(() => new SimplePrompter(0), { setDefault: () => 100 })
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
        testForm.body.prop1.setDefault(() => 100)
        testForm.body.prop2.setDefault(state => `default: ${state.prop1}`)
        tester.prop1.assertValue(100)
        tester.prop2.assertValue('default: undefined')
        tester.prop1.applyInput(50)
        tester.prop2.assertValue('default: 50')
    })

    describe('requireParent', function () {
        it('only show prompters when parent is defined', function () {
            testForm.body.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''), { requireParent: true })
            testForm.body.nestedProp.prop2.bindPrompter(() => new SimplePrompter(''))
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.prop2.assertShow()
            tester.nestedProp.applyInput({})
            tester.nestedProp.prop1.assertShow()
            tester.nestedProp.prop2.assertShow()
        })

        it('works with "showWhen"', function () {
            testForm.body.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''), {
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
            testForm.body.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''), {
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
            testForm.body.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''))
            tester.nestedProp.prop1.assertShow()
        })

        it('can apply another form to a property', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''))
            testForm.body.nestedProp.applyForm(nestedTestForm)
            tester.nestedProp.prop1.assertShow()
        })

        it('can check if a form would be shown', function () {
            testForm.body.nestedProp.applyForm(nestedTestForm, { showWhen: state => !!state.prop1 })
            tester.nestedProp.assertDoesNotShow()
            tester.prop1.applyInput(1)
            tester.nestedProp.assertShow()
        })

        it('propagates state to local forms', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''), {
                showWhen: state => state.prop2 === 'hello',
            })
            testForm.body.nestedProp.applyForm(nestedTestForm)
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.prop2.applyInput('hello')
            tester.nestedProp.prop1.assertShow()
        })

        it('can apply form with "requireParent"', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''), {
                showWhen: state => state.prop2 === 'hello',
            })
            nestedTestForm.body.prop2.setDefault(() => 'hello')
            testForm.body.nestedProp.applyForm(nestedTestForm, { requireParent: true })
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

            testForm.body.nestedProp.applyForm(nestedTestForm, { showWhen: state => state.prop2 === 'start' })
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

        it('can apply form with "setDefault"', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''), { requireParent: true })
            nestedTestForm.body.prop2.setDefault(state => (state.prop1 ? `${state.prop1}.${state.prop1}` : undefined))

            testForm.body.nestedProp.applyForm(nestedTestForm, { setDefault: () => ({ prop1: 'test' }) })
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.prop1.assertValue('test')
            tester.nestedProp.prop2.assertValue(undefined)
            tester.nestedProp.applyInput({})
            tester.nestedProp.prop1.assertShow()
            tester.nestedProp.applyInput({ prop1: 'new' })
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.prop2.assertValue('new.new')
        })
    })
})
