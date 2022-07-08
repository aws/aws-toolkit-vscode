/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as vscode from 'vscode'
import * as assert from 'assert'
import * as moment from 'moment'
import {
    SelectLogStreamWizardContext,
    SelectLogStreamWizard,
    convertDescribeLogStreamsToQuickPickItems,
} from '../../../cloudWatchLogs/commands/viewLogStream'
import { LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'
import { LOCALIZED_DATE_FORMAT } from '../../../shared/constants'
import globals from '../../../shared/extensionGlobals'
import {
    SearchLogGroupWizard,
    createLogGroupPrompter,
    createFilterpatternPrompter,
} from '../../../cloudWatchLogs/commands/searchLogGroup'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { createQuickPickTester } from '../../shared/ui/testUtils'
import { exposeEmitters, ExposeEmitters } from '../../../../src/test/shared/vscode/testUtils'
import { InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'

class FakeNode extends AWSTreeNodeBase {
    public constructor(label: string) {
        super(label)
    }
}

describe('searchLogGroupWizard', async function () {
    let fakeLogNodes: AWSTreeNodeBase[] = []
    let inputBox: ExposeEmitters<vscode.InputBox, 'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'>
    let testPrompter: InputBoxPrompter

    before(function () {
        fakeLogNodes.push(new FakeNode('group-1'), new FakeNode('group-2'), new FakeNode('group-3'))
        testPrompter = createFilterpatternPrompter()

        inputBox = exposeEmitters(testPrompter.inputBox, ['onDidAccept', 'onDidChangeValue', 'onDidTriggerButton'])
    })

    it('Wizard accepts inputs', async function () {
        const testWizard = createWizardTester(new SearchLogGroupWizard(fakeLogNodes))
        const logGroupSelection = 'group-2'
        testWizard.logGroup.applyInput(logGroupSelection)
        testWizard.logGroup.assertValue(logGroupSelection)

        const filterPatternSelection = 'this is filter text'
        testWizard.filterPattern.applyInput(filterPatternSelection)
        testWizard.filterPattern.assertValue(filterPatternSelection)
    })

    // it('Wizard does not show filterPattern inputBox if no log Group', async function () {
    //     const testWizard = createWizardTester(new SearchLogGroupWizard(fakeLogNodes))
    //     testWizard.logGroup.clearInput()
    //     testWizard.filterPattern.assertDoesNotShow()
    // })

    it('creates Log Group prompter from TreeNodes', async function () {
        const prompter = createLogGroupPrompter(fakeLogNodes)
        const tester = createQuickPickTester(prompter)
        tester.assertItems(['group-1', 'group-2', 'group-3'])
        const selection = 'group-2'
        tester.acceptItem(selection)
        tester.result(selection)
    })

    it('creates an valid InputBox', async function () {
        assert.strictEqual(inputBox.title, 'Keyword Search')
        assert.strictEqual(inputBox.placeholder, 'Enter text here')
    })

    it('filterPattern InputBox accepts input', async function () {
        /** Sets the input box's value then fires an accept event */
        // copied from 'src/test/shared/ui/inputPrompter.test.ts'
        function accept(value: string): void {
            inputBox.value = value
            inputBox.fireOnDidAccept()
        }

        const testInput = 'this is my filterPattern'
        const result = testPrompter.prompt()
        accept(testInput)
        assert.strictEqual(await result, testInput)
    })
})
// it('exits when cancelled', async function () {
//     // This prompts me for a selection, but I want it to be automatic.
//     const wizard = new SearchLogGroupWizard(fakeLogNodes)
//     const result = await wizard.run()

//     assert.ok(!result)
// })
//})

//     it('returns the selected log group name', async function () {
//         const groupName = 'stream/name'
//         const region = 'us-weast-99'
//         const groupName = 'grouper'
//         const wizard = new SelectLogStreamWizard(
//             new LogGroupNode(region, { logGroupName: groupName }),
//             new MockSelectLogStreamWizardContext([streamName])
//         )
//         const result = await wizard.run()

//         assert.ok(result)
//         assert.strictEqual(result?.logGroupName, groupName)
//         assert.strictEqual(result?.logStreamName, streamName)
//         assert.strictEqual(result?.region, region)
//     })
// })

// describe('convertDescribeLogStreamsToQuickPickItems', function () {
//     it('converts things correctly', function () {
//         const time = new globals.clock.Date().getTime()
//         const results = convertDescribeLogStreamsToQuickPickItems({
//             logStreams: [
//                 {
//                     logStreamName: 'streamWithoutTimestamp',
//                 },
//                 {
//                     logStreamName: 'streamWithTimestamp',
//                     lastEventTimestamp: time,
//                 },
//             ],
//         })

//         assert.strictEqual(results.length, 2)
//         assert.deepStrictEqual(results[0], {
//             label: 'streamWithoutTimestamp',
//             detail: localize('AWS.cloudWatchLogs.viewLogStream.workflow.noStreams', '[No Log Events found]'),
//         })
//         assert.deepStrictEqual(results[1], {
//             label: 'streamWithTimestamp',
//             detail: moment(time).format(LOCALIZED_DATE_FORMAT),
//         })
//         const noResults = convertDescribeLogStreamsToQuickPickItems({})
//         assert.strictEqual(noResults.length, 0)
//     })
// })
