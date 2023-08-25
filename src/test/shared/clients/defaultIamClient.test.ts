/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { DefaultIamClient } from '../../../shared/clients/iamClient'

describe('getFriendlyName', function () {
    const client = new DefaultIamClient('')
    it('throws error on invalid arns', function () {
        const testArn1 = 'arn:aws:iam::testId:name'
        const testArn2 = 'thisIsNotAnArn'

        assert.throws(() => client.getFriendlyName(testArn1))
        assert.throws(() => client.getFriendlyName(testArn2))
    })

    it('correctly parses valid arns', function () {
        const testArn1 = 'arn:aws:iam::testId/name1'
        const testArn2 = 'arn:aws:iam::testId2/name2'

        assert.strictEqual(client.getFriendlyName(testArn1), 'name1')
        assert.strictEqual(client.getFriendlyName(testArn2), 'name2')
    })
})
