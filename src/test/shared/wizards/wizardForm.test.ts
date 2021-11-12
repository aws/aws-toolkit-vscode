/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
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

    beforeEach(function () {
        testWizard = new Wizard()
        testForm = testWizard.form
        tester = createWizardTester(testWizard)
    })

    it('can add prompter', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(0))
        tester.prop1.assertShow()
        assert.notStrictEqual(testWizard.boundForm.getPrompterProvider('prop1'), undefined)
    })

    it('throws if trying to re-bind', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(0))
        assert.throws(() => testForm.prop1.bindPrompter(() => new SimplePrompter(0)))
    })

    it('throws when reassigning defaults', function () {
        testForm.prop1.setDefault(0)
        assert.throws(() => testForm.prop1.setDefault(1))
    })

    it('caches `properties`', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(0))
        const props = testWizard.boundForm.properties
        assert.strictEqual(testWizard.boundForm.properties, props)
        testForm.prop2.bindPrompter(() => new SimplePrompter(''))
        assert.notStrictEqual(testWizard.boundForm.properties, props)
    })

    it('ignores `setDefault` if property is assigned', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(1), {
            setDefault: () => 0,
        })
        testForm.prop2.bindPrompter(() => new SimplePrompter(''), {
            showWhen: state => state.prop1 === 0,
        })

        tester.prop1.assertShow()
        tester.prop1.assertValue(undefined)
        tester.prop2.assertDoesNotShow()
    })

    it('uses relative order', function () {
        testForm.prop1.bindPrompter(() => new SimplePrompter(0), { relativeOrder: 1 })
        testForm.prop2.bindPrompter(() => new SimplePrompter(''), { relativeOrder: 0 })

        tester.prop2.assertShow()
        tester.prop1.assertShow()
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
        testForm.prop1.bindPrompter(() => new SimplePrompter(0), {
            setDefault: () => 100,
            showWhen: state => state.prop2 === 'foo',
        })

        tester.prop1.assertValue(100)
        tester.prop1.applyInput(5)
        tester.prop1.assertValue(5)
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

        it('does not apply defaults if the top form cannot be shown', function () {
            nestedTestForm.body.prop1.setDefault('0')
            testForm.nestedProp.applyBoundForm(nestedTestForm, { dependencies: [testForm.prop2] })
            tester.nestedProp.prop1.assertValue(undefined)
        })

        it('can apply dependencies', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''))
            testForm.nestedProp.applyBoundForm(nestedTestForm, { dependencies: [testForm.prop1] })
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.prop1.applyInput(0)
            tester.nestedProp.prop1.assertShow()
        })

        it('considers parent form dependencies with child dependencies', function () {
            nestedTestForm.body.prop1.bindPrompter(() => new SimplePrompter(''), {
                dependencies: [nestedTestForm.body.prop2],
            })
            testForm.nestedProp.applyBoundForm(nestedTestForm, { dependencies: [testForm.prop1] })
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.prop1.applyInput(0)
            tester.nestedProp.prop1.assertDoesNotShow()
            tester.nestedProp.prop2.applyInput('')
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

        it('propagates wizard-specific state down to prompters', function () {
            nestedTestForm.body.prop1.bindPrompter(state => {
                assert.ok(state.estimator)
                assert.ok(state.stepCache)
                return new SimplePrompter('')
            })
            testForm.nestedProp.applyBoundForm(nestedTestForm)
            tester.nestedProp.prop2.applyInput('hello')
            testWizard.boundForm.getPrompterProvider('prop2')?.({ stepCache: {}, estimator: () => 0 })
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

    describe('dependencies', function () {
        it('throws if there is a cycle', function () {
            testForm.prop1.bindPrompter(() => new SimplePrompter(0), { dependencies: [testForm.prop2] })
            testForm.prop2.bindPrompter(() => new SimplePrompter(''), { dependencies: [testForm.nestedProp.prop1] })
            testForm.nestedProp.prop1.bindPrompter(() => new SimplePrompter(''), { dependencies: [testForm.prop1] })
            // TODO: make a better error message, right now it's `Error: Cyclic dependency, node was:"prop1"`
            assert.throws(() => testWizard.boundForm.properties)
        })

        it('can resolve dependencies', function () {
            testForm.prop1.bindPrompter(() => new SimplePrompter(0), { dependencies: [testForm.prop2] })
            testForm.prop2.bindPrompter(() => new SimplePrompter(''))

            tester.prop2.assertShowFirst()
            tester.prop1.assertShowSecond()
        })

        it('can resolve dependencies with `showWhen`', function () {
            testForm.prop1.bindPrompter(() => new SimplePrompter(0), {
                dependencies: [testForm.prop2],
                showWhen: state => state.prop2 === 'xyz',
            })

            tester.prop1.assertDoesNotShow()
            tester.prop2.applyInput('')
            tester.prop1.assertDoesNotShow()
            tester.prop2.applyInput('xyz')
            tester.prop1.assertShow()
        })

        it('`setDefault` can use dependencies', function () {
            testForm.prop1.setDefault(state => state.prop2.length, { dependencies: [testForm.prop2] })
            tester.prop1.assertValue(undefined)
            tester.prop2.applyInput('abc')
            tester.prop1.assertValue(3)
        })

        it('can resolve dependencies with `setDefault`', function () {
            testForm.prop1.bindPrompter(() => new SimplePrompter(0), {
                dependencies: [testForm.prop2],
                showWhen: state => state.prop2 === 'xyz',
            })
            testForm.prop2.setDefault('xyz')
            tester.prop1.assertShow()
        })
    })
})
