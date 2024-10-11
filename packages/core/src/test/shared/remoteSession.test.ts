/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { minimumSsmActions } from '../../shared/remoteSession'

describe('minimumSsmActions', function () {
    it('should contain minimal actions needed for ssm connection', function () {
        assert.deepStrictEqual(minimumSsmActions, [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
            'ssm:DescribeAssociation',
            'ssm:ListAssociations',
            'ssm:UpdateInstanceInformation',
        ])
    })
})
