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
import { FakeParentNode } from '../../cdk/explorer/constructNode.test'
import { LOCALIZED_DATE_FORMAT } from '../../../shared/constants'

class MockSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    public constructor(private readonly pickLogStreamResponses: (string | undefined)[] = []) {
        this.pickLogStreamResponses = pickLogStreamResponses.reverse()
    }

    public async pickLogStream(): Promise<string | undefined> {
        if (this.pickLogStreamResponses.length <= 0) {
            throw new Error('pickLogStream was called more times than expected')
        }

        const response = this.pickLogStreamResponses.pop()
        if (!response) {
            return undefined
        }

        return response
    }
}

describe('viewLogStreamWizard', async function () {
    it('exits when cancelled', async function () {
        const wizard = new SelectLogStreamWizard(
            new LogGroupNode(new FakeParentNode('asdf'), 'region', {}),
            new MockSelectLogStreamWizardContext([undefined])
        )
        const result = await wizard.run()

        assert.ok(!result)
    })

    it('returns the selected log stream name', async function () {
        const streamName = 'stream/name'
        const region = 'us-weast-99'
        const groupName = 'grouper'
        const wizard = new SelectLogStreamWizard(
            new LogGroupNode(new FakeParentNode('asdf'), region, { logGroupName: groupName }),
            new MockSelectLogStreamWizardContext([streamName])
        )
        const result = await wizard.run()

        assert.ok(result)
        assert.strictEqual(result?.logGroupName, groupName)
        assert.strictEqual(result?.logStreamName, streamName)
        assert.strictEqual(result?.region, region)
    })
})

describe('convertDescribeLogStreamsToQuickPickItems', function () {
    it('converts things correctly', function () {
        const time = new Date().getTime()
        const results = convertDescribeLogStreamsToQuickPickItems({
            logStreams: [
                {
                    logStreamName: 'streamWithoutTimestamp',
                },
                {
                    logStreamName: 'streamWithTimestamp',
                    lastEventTimestamp: time,
                },
            ],
        })

        assert.strictEqual(results.length, 2)
        assert.deepStrictEqual(results[0], {
            label: 'streamWithoutTimestamp',
            detail: localize('AWS.cloudWatchLogs.viewLogStream.workflow.noStreams', '[No Log Events found]'),
        })
        assert.deepStrictEqual(results[1], {
            label: 'streamWithTimestamp',
            detail: moment(time).format(LOCALIZED_DATE_FORMAT),
        })
        const noResults = convertDescribeLogStreamsToQuickPickItems({})
        assert.strictEqual(noResults.length, 0)
    })
})
