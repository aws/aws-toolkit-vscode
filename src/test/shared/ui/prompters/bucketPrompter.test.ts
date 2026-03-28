/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createBucketPrompter } from '../../../../shared/ui/common/bucketPrompter'
import { createQuickPickPrompterTester } from '../testUtils'
import { S3Client } from '../../../../shared/clients/s3Client'
import { mock, instance, when } from '../../../utilities/mockito'

describe('createBucketPrompter', function () {
    let s3: S3Client

    beforeEach(function () {
        s3 = mock()
        when(s3.listBuckets()).thenResolve({
            buckets: [
                { name: 'bucketA', region: 'region', arn: 'arn' },
                { name: 'bucketB', region: 'region', arn: 'arn' },
                { name: 'bucketC', region: 'region', arn: 'arn' },
            ],
        })
    })
    it('prompts for bucket', async function () {
        const prompter = await createBucketPrompter('region', { s3Client: instance(s3) })
        const tester = createQuickPickPrompterTester(prompter)
        tester.assertItems(['bucketA', 'bucketB', 'bucketC'])
    })

    it('moves recent bucket to top', async function () {
        const prompter = await createBucketPrompter('region', { s3Client: instance(s3) })
        const tester = createQuickPickPrompterTester(prompter)
        tester.acceptItem('bucketC')
        const newTester = createQuickPickPrompterTester(prompter)
        newTester.assertItems(['bucketC', 'bucketA', 'bucketB'])
    })
})
