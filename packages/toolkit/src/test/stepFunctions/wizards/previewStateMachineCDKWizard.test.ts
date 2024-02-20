/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ConstructTreeEntity } from '../../../cdk/explorer/tree/types'
import {
    getStateMachines,
    PreviewStateMachineCDKWizard,
} from '../../../stepFunctions/wizards/previewStateMachineCDKWizard'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'

const stateMachine1: ConstructTreeEntity = {
    id: 'MyStateMachine',
    path: 'aws-tester/MyTopLevelNode/MyStateMachine',
    children: {
        Resource: {
            id: 'Resource',
            path: 'aws-tester/MyTopLevelNode/MyStateMachine/Resource',
            attributes: {
                'aws:cdk:cloudformation:type': 'AWS::StepFunctions::StateMachine',
            },
        },
    },
}

const stateMachine2: ConstructTreeEntity = {
    id: 'MyOtherStateMachine',
    path: 'aws-tester/MyTopLevelNode/NestedNode/MyOtherStateMachine',
    children: {
        Resource: {
            id: 'Resource',
            path: 'aws-tester/MyTopLevelNode/NestedNode/MyOtherStateMachine/Resource',
            attributes: {
                'aws:cdk:cloudformation:type': 'AWS::StepFunctions::StateMachine',
            },
        },
    },
}

const nested = {
    id: 'NestedNode',
    path: 'aws-tester/MyTopLevelNode',
    children: {
        MyOtherStateMachine: stateMachine2,
    },
}

const root: ConstructTreeEntity = {
    id: 'MyTopLevelNode',
    path: 'aws-tester/MyTopLevelNode',
    children: {
        Resource: {
            id: 'Resource',
            path: 'aws-tester/MyTopLevelNode/Resource',
            attributes: {
                'aws:cdk:cloudformation:type': 'AWS::StepFunctions::ConstructNode',
            },
        },
        MyStateMachine: stateMachine1,
        NestedNode: nested,
    },
}

describe('getStateMachines', function () {
    it('returns the input if it already is a state machine', function () {
        const result = getStateMachines(stateMachine1)
        assert.deepStrictEqual(result, [stateMachine1])
    })

    it('lists all state machines from a construct (depth=1)', function () {
        const result = getStateMachines(nested)
        assert.deepStrictEqual(result, [stateMachine2])
    })

    it('lists all state machines from a construct (depth=2)', function () {
        const result = getStateMachines(root)
        assert.strictEqual(result.length, 2)
        assert.deepStrictEqual(result, [stateMachine1, stateMachine2])
    })
})

describe('PreviewStateMachineCDKWizard', async function () {
    let tester: WizardTester<PreviewStateMachineCDKWizard>

    beforeEach(function () {
        tester = createWizardTester(new PreviewStateMachineCDKWizard())
    })

    it('prompts for location then a state machine', function () {
        tester.location.assertShowFirst()
        tester.resource.assertShowSecond()
        tester.assertShowCount(2)
    })
})
