/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as assert from 'assert'
import * as _ from 'lodash'
import { mock, when, instance, anything } from 'ts-mockito'
import { createS3BucketPrompter, S3BucketPrompterOptions } from '../../../../shared/ui/common/s3Bucket'
import { Bucket, DefaultS3Client } from '../../../../shared/clients/s3Client'
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
    const client = mock(DefaultS3Client)
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
        const buckets = scenario.buckets ?? []
        const current = () => (!Array.isArray(buckets[0]) ? buckets : buckets.pop() ?? []) as Bucket[]

        when(client.listBuckets()).thenReturn(Promise.resolve({ buckets: current() }))
        when(client.listBucketsIterable()).thenCall(async function* () {
            yield* current()
        })
        when(client.createBucket(anything())).thenCall(req => {
            const bucket = createBucket(req.bucketName)
            if (Array.isArray(buckets[0])) {
                buckets[0].push(bucket)
            } else {
                ;(buckets as Bucket[]).push(bucket)
            }
            return Promise.resolve({ bucket })
        })
        when(client.checkBucketExists(anything())).thenCall(async name => {
            return current().some(b => b.name === name)
        })

        sinon.stub(ext, 'toolkitClientBuilder').value({
            createS3Client: () => instance(client),
        })

        tester = createQuickPickTester(createS3BucketPrompter(scenario.options))
    })

    afterEach(function () {
        sinon.restore()
    })

    it('uses a title', { options: { title: 'title' } }, function () {
        assert.strictEqual(tester.quickPick.title, this.scenario.options.title)
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

    it(
        'adds `baseBuckets`',
        { buckets: [createBucket('bucket')], options: { baseBuckets: ['base'] } },
        async function () {
            tester.assertItems(['base', 'bucket'])
            tester.hide()

            await tester.result()
        }
    )

    it('shows placeholder', { options: { noBucketMessage: 'placeholder' } }, async function () {
        tester.assertItems(['placeholder'])
        tester.acceptItem('placeholder')
        assert.strictEqual(await tester.result(), WIZARD_BACK)
    })

    // TODO: verify this differentiates based off region
    // we need some better mocking constructs to make this not so tedious
    it('allows user to input their own bucket name', { buckets: [createBucket('my-bucket')] }, async function () {
        if (vscode.version.startsWith('1.44')) {
            this.skip()
        }

        tester.setFilter('my-bucket')
        // TODO: use fake timer? Need to do this since the filter box is debounced
        tester.addCallback(() => new Promise(r => setTimeout(r, 300)))
        tester.acceptItem('Enter bucket name: ')
        const result = await tester.result()
        // TODO: we should fetch the real bucket and return rather than just the name
        assert.strictEqual((result as Bucket).name, this.scenario.buckets[0].name)
    })

    it('can create buckets', {}, async function () {
        if (vscode.version.startsWith('1.44')) {
            this.skip()
        }

        tester.setFilter('newbucket')
        tester.addCallback(() => new Promise(r => setTimeout(r, 300)))
        tester.acceptItem('Enter bucket name: ')
        tester.setFilter(undefined)
        tester.assertItems(['newbucket'])
        tester.acceptItem('newbucket')
        await tester.result()
    })

    // TODO: test settings
    // TODO: add other features?
    // TODO: test order?
})
