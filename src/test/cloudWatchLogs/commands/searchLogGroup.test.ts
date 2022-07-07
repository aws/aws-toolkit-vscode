/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

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
import { SearchLogGroupWizard, createLogGroupPrompter } from '../../../cloudWatchLogs/commands/searchLogGroup'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { createQuickPickTester } from '../../shared/ui/testUtils'
class FakeNode extends AWSTreeNodeBase {
    public constructor(label: string) {
        super(label)
    }
}

describe('searchLogGroupWizard', async function () {
    let fakeLogNodes: AWSTreeNodeBase[] = []

    before(function () {
        let fakeLogNodes: AWSTreeNodeBase[] = []
        fakeLogNodes.push(new FakeNode('group-1'), new FakeNode('group-2'), new FakeNode('group-3'))
    })
    it('creates Log Group prompter from TreenNodes', async function () {
        const prompter = createLogGroupPrompter(fakeLogNodes)
        const tester = createQuickPickTester(prompter)
        tester.assertItems(['group-1', 'group-2', 'group-3'])
        const selection = 'group-2'
        tester.acceptItem(selection)
        tester.result(selection)
    })
    // it('exits when cancelled', async function () {
    //     // This prompts me for a selection, but I want it to be automatic.
    //     const wizard = new SearchLogGroupWizard(fakeLogNodes)
    //     const result = await wizard.run()

    //     assert.ok(!result)
    // })
})

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
