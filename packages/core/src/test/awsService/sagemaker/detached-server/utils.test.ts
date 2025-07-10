/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { parseArn } from '../../../../awsService/sagemaker/detached-server/utils'

describe('parseArn', () => {
    it('parses a standard SageMaker ARN with forward slash', () => {
        const arn = 'arn:aws:sagemaker:us-west-2:123456789012:space/domain-name/my-space-name'
        const result = parseArn(arn)
        assert.deepStrictEqual(result, {
            region: 'us-west-2',
            accountId: '123456789012',
            spaceName: 'my-space-name',
        })
    })

    it('parses an ARN prefixed with sagemaker-user@', () => {
        const arn = 'sagemaker-user@arn:aws:sagemaker:ap-southeast-1:123456789012:space/foo/my-space-name'
        const result = parseArn(arn)
        assert.deepStrictEqual(result, {
            region: 'ap-southeast-1',
            accountId: '123456789012',
            spaceName: 'my-space-name',
        })
    })

    it('throws on malformed ARN', () => {
        const invalidArn = 'arn:aws:invalid:format'
        assert.throws(() => parseArn(invalidArn), /Invalid SageMaker ARN format/)
    })

    it('throws when missing region/account', () => {
        const invalidArn = 'arn:aws:sagemaker:::space/xyz'
        assert.throws(() => parseArn(invalidArn), /Invalid SageMaker ARN format/)
    })
})
