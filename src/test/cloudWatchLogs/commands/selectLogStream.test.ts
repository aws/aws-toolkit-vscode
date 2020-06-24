/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SelectLogStreamWizardContext, SelectLogStreamWizard } from '../../../cloudWatchLogs/commands/selectLogStream'
import { LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'
import { FakeParentNode } from '../../cdk/explorer/constructNode.test'

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

describe('selectLogStreamWizard', async () => {
    it('exits when cancelled', async () => {
        const wizard = new SelectLogStreamWizard(
            new LogGroupNode(new FakeParentNode('asdf'), 'region', {}),
            new MockSelectLogStreamWizardContext([undefined])
        )
        const result = await wizard.run()

        assert.ok(!result)
    })

    it('returns the selected log stream name', async () => {
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
