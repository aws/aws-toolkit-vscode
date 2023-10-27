/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { IotClient, IotPolicy } from '../../../shared/clients/iotClient'
import { PolicyVersion } from "@aws-sdk/client-iot";
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyVersionNode } from '../../../iot/explorer/iotPolicyVersionNode'
import moment from 'moment'
import { LOCALIZED_DATE_FORMAT } from '../../../shared/constants'
import { stringOrProp } from '../../../shared/utilities/tsUtils'

describe('IotPolicyVersionNode', function () {
    const policyName = 'policy'
    const expectedPolicy: IotPolicy = { name: policyName, arn: 'arn' }
    const createDate = new Date(2021, 1, 1)
    const createDateFormatted = moment(createDate).format(LOCALIZED_DATE_FORMAT)
    const policyVersion: PolicyVersion = { versionId: 'V1', isDefaultVersion: true, createDate }
    const nonDefaultVersion: PolicyVersion = { versionId: 'V2', isDefaultVersion: false, createDate }

    it('creates an IoT Policy Version Node for default version', async function () {
        const node = new IotPolicyVersionNode(
            expectedPolicy,
            policyVersion,
            policyVersion.isDefaultVersion!,
            {} as IotPolicyWithVersionsNode,
            {} as IotClient
        )

        assert.ok(
            stringOrProp(node.tooltip, 'tooltip').startsWith(
                `Policy: ${policyName}\nVersion: V1\nDEFAULT\nCreated: ${createDateFormatted}`
            )
        )
        assert.strictEqual(node.label, 'Version V1*')
    })

    it('creates an IoT Policy Version Node for non-default version', async function () {
        const node = new IotPolicyVersionNode(
            expectedPolicy,
            nonDefaultVersion,
            nonDefaultVersion.isDefaultVersion!,
            {} as IotPolicyWithVersionsNode,
            {} as IotClient
        )

        assert.ok(
            stringOrProp(node.tooltip, 'tooltip').startsWith(
                `Policy: ${policyName}\nVersion: V2\nCreated: ${createDateFormatted}`
            )
        )
        assert.strictEqual(node.label, 'Version V2')
    })
})
