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
import { WizardControl } from '../../../../shared/wizards/util'

interface Scenario {
    buckets?: Bucket[] | Bucket[][]
    options?: S3BucketPrompterOptions
}

function createBucket(name: string, region: string = '', arn: string = '') {
    return { name, region, arn }
}

describe('createS3BucketPrompter', function () {
    const client = mock(DefaultS3Client)
    const scenarios: Record<string, Scenario> = {}

    before(function () {
        ext.toolkitClientBuilder = {} as any
    })

    let tester: QuickPickTester<Bucket>

    beforeEach(function () {
        const scenario = scenarios[this.currentTest?.title ?? '']
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
        this.scenario = scenario
    })

    afterEach(function () {
        sinon.restore()
    })

    function withScenario<S extends Scenario>(
        title: string,
        scenario: S,
        fn: (this: Mocha.Context & { scenario: S }) => any
    ) {
        scenarios[title] = scenario
        it(title, fn as any) // Mocha lies about the context type
    }

    withScenario('uses a title', { options: { title: 'title' } }, function () {
        assert.strictEqual(tester.quickPick.title, this.scenario.options.title)
    })

    withScenario('prompts for bucket', { buckets: [createBucket('bucket')] }, async function () {
        tester.assertItems(['bucket'])
        tester.acceptItem('bucket')
        assert.deepStrictEqual(await tester.result(), this.scenario.buckets[0])
    })

    withScenario(
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

    withScenario(
        'adds `baseBuckets`',
        { buckets: [createBucket('bucket')], options: { baseBuckets: ['base'] } },
        async function () {
            tester.assertItems(['base', 'bucket'])
            tester.hide()

            await tester.result()
        }
    )

    withScenario('shows placeholder', { options: { noBucketMessage: 'placeholder' } }, async function () {
        tester.assertItems(['placeholder'])
        tester.acceptItem('placeholder')
        assert.strictEqual(await tester.result(), WizardControl.Back)
    })

    // TODO: verify this differentiates based off region
    // we need some better mocking constructs to make this not so tedious
    withScenario(
        'allows user to input their own bucket name',
        { buckets: [createBucket('my-bucket')] },
        async function () {
            if (vscode.version.startsWith('1.44')) {
                return
            }

            tester.setValue('my-bucket')
            // TODO: use fake timer? Need to do this since the filter box is debounced
            tester.acceptItem('Enter bucket name: ')
            const result = await tester.result()
            // TODO: we should fetch the real bucket and return rather than just the name
            assert.strictEqual((result as Bucket).name, this.scenario.buckets[0].name)
        }
    )

    withScenario('can create buckets from the filter box', {}, async function () {
        if (vscode.version.startsWith('1.44')) {
            return
        }

        tester.setValue('newbucket')
        tester.acceptItem('Enter bucket name: ')
        await tester.result(createBucket('newbucket'))
    })

    // TODO: test settings
    // TODO: add other features?
    // TODO: test order?
})
