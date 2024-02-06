/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import assert from 'assert'
import {
    SelectLogStreamWizardContext,
    SelectLogStreamWizard,
    convertDescribeLogToQuickPickItems,
    LogSearchChoice,
} from '../../../cloudWatchLogs/commands/viewLogStream'
import { LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'
import globals from '../../../shared/extensionGlobals'
import { formatLocalized } from '../../../shared/utilities/textUtilities'

class MockSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    public constructor(private readonly pickLogStreamResponses: LogSearchChoice[] = []) {
        this.pickLogStreamResponses = pickLogStreamResponses.reverse()
    }

    public async pickLogStream(): Promise<LogSearchChoice> {
        if (this.pickLogStreamResponses.length <= 0) {
            throw new Error('pickLogStream was called more times than expected')
        }

        const response = this.pickLogStreamResponses.pop()
        if (!response) {
            return { kind: 'cancelled' }
        }

        return response
    }
}

describe('viewLogStreamWizard', async function () {
    it('exits when cancelled', async function () {
        const wizard = new SelectLogStreamWizard(
            new LogGroupNode('region', {}),
            new MockSelectLogStreamWizardContext([{ kind: 'cancelled' }])
        )
        const result = await wizard.run()

        assert.strictEqual(result?.kind, 'cancelled')
    })

    it('returns the selected log stream name', async function () {
        const streamName = 'stream/name'
        const region = 'us-weast-99'
        const groupName = 'grouper'
        const wizard = new SelectLogStreamWizard(
            new LogGroupNode(region, { logGroupName: groupName }),
            new MockSelectLogStreamWizardContext([
                { kind: 'selectedLogStream', region: region, logGroupName: groupName, logStreamName: streamName },
            ])
        )
        const result = await wizard.run()

        assert.ok(result)
        // HACK: using '===' since following this assertion the exact
        // type of 'result' is narrowed down to 'selectedLogStream'.
        // Otherwise we get TS2339 error.
        assert.ok(result.kind === 'selectedLogStream')
        assert.strictEqual(result.logGroupName, groupName)
        assert.strictEqual(result.logStreamName, streamName)
        assert.strictEqual(result.region, region)
    })
})

describe('convertDescribeLogToQuickPickItems', function () {
    it('converts things correctly', function () {
        const time = new globals.clock.Date().getTime()
        const results = convertDescribeLogToQuickPickItems({
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
            detail: localize('AWS.cwl.viewLogStream.workflow.noStreams', '[No Log Events found]'),
        })
        assert.deepStrictEqual(results[1], {
            label: 'streamWithTimestamp',
            detail: formatLocalized(new Date(time)),
        })
        const noResults = convertDescribeLogToQuickPickItems({})
        assert.strictEqual(noResults.length, 0)
    })
})
