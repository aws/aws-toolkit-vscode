/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import * as _ from 'lodash'
import { createS3BucketPrompter, S3BucketPrompterOptions } from '../../../../shared/ui/common/s3Bucket'
import { Bucket } from '../../../../shared/clients/s3Client'
import { createQuickPickTester, QuickPickTester } from '../testUtils'
import { ext } from '../../../../shared/extensionGlobals'
import { WIZARD_BACK } from '../../../../shared/wizards/wizard'

const mochaIt = it

interface Scenario {
    buckets?: Bucket[] | Bucket[][]
    options?: S3BucketPrompterOptions
}

function createBucket(name: string, region: string = '', arn: string = '') {
    return { name, region, arn }
}

describe('createS3BucketPrompter', function () {
    const scenarios = new Map<string, Scenario>()
    // TODO: make this work with mocha Func/AsyncFunc
    const it = <T extends (this: Mocha.Context & { scenario: S }) => any, S extends Scenario>(
        title: string,
        scenario: S,
        func?: T
    ) => {
        scenarios.set(title, scenario)
        mochaIt.call(this.ctx, title, function (this: Mocha.Context) {
            return func?.call(Object.assign({ scenario: _.cloneDeep(scenario) }, this))
        })
    }

    before(function () {
        ext.toolkitClientBuilder = {} as any
    })

    let tester: QuickPickTester<Bucket>

    beforeEach(function () {
        const scenario = scenarios.get(this.currentTest?.title ?? '') ?? {}

        sinon.stub(ext, 'toolkitClientBuilder').value({
            createS3Client: () => ({
                listBuckets: () => {
                    const buckets = scenario.buckets ?? []
                    return Promise.resolve({ buckets: Array.isArray(buckets[0]) ? buckets.pop() ?? [] : buckets })
                },
            }),
        })
        // TODO: just rename `result` method to prompt and override the base prompt method

        tester = createQuickPickTester(createS3BucketPrompter(scenario.options))
    })

    afterEach(function () {
        sinon.restore()
    })

    it('uses a title', { options: { promptTitle: 'title' } }, function () {
        assert.strictEqual(tester.quickPick.title, this.scenario.options.promptTitle)
    })

    it('prompts for bucket', { buckets: [createBucket('bucket')] }, async function () {
        tester.assertItems(['bucket'])
        tester.acceptItem('bucket')
        assert.deepStrictEqual(await tester.result(), this.scenario.buckets[0])
    })

    it(
        'can filter buckets',
        {
            buckets: [createBucket('bucket'), createBucket('other')],
            options: { filter: bucket => bucket.name === 'bucket' },
        },
        async function () {
            tester.assertItems(['bucket'])
            tester.acceptItem('bucket')
            assert.deepStrictEqual(await tester.result(), this.scenario.buckets[0])
        }
    )

    // TODO: move over code that applies filtering logic
    it(
        'adds `baseBuckets`',
        { buckets: [createBucket('bucket')], options: { baseBuckets: ['base'] } },
        async function () {
            tester.assertItems(['base', 'bucket'])
            tester.acceptItem('base')
            // TODO: make this actually create the bucket
            assert.deepStrictEqual(await tester.result(), {
                name: this.scenario.options.baseBuckets[0],
                region: '',
                arn: '',
            })
        }
    )

    it('shows placeholder', { options: { noBucketMessage: 'placeholder' } }, async function () {
        tester.assertItems(['placeholder'])
        tester.acceptItem('placeholder')
        assert.strictEqual(await tester.result(), WIZARD_BACK)
    })

    // TODO: test settings
    // TODO: test for create bucket button
    // TODO: test for filter input box
    // TODO: add other features?
    // TODO: test order?
})
