/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { convertEcsArnToResourceName } from '../../awsexplorer/explorerUtils'

describe('explorerUtils', () => {
    describe('convertEcsArnToResourceName', () => {
        // Will we be capturing task definition revision number? If so, retool this test.
        it ('converts cluster, service, and task definition arns to friendly names', () => {

            const clusterArn = 'arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster'
            const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/sample-webapp'
            const taskDefArn = 'arn:aws:ecs:us-east-1:123456789012:task-definition/hello_world:8'
            const clusterName = 'my-cluster'
            const serviceName = 'sample-webapp'
            const taskDefName = 'hello_world'

            assert.strictEqual(convertEcsArnToResourceName(clusterArn), clusterName)
            assert.strictEqual(convertEcsArnToResourceName(serviceArn), serviceName)
            assert.strictEqual(convertEcsArnToResourceName(taskDefArn), taskDefName)
        })
        it ('converts service arns that include the cluster name to a friendly name', () => {

            const fullServiceArn = 'arn:aws:ecs:us-east-1:123456789012:service/my-cluster/sample-webapp'
            const clusterName = 'my-cluster'
            const serviceName = 'sample-webapp'

            assert.strictEqual(convertEcsArnToResourceName(fullServiceArn, clusterName), serviceName)
        })
        it ('returns undefined for invalid arns', () => {

            const badArn = 'you thought this was an ARN? Please.'

            assert.strictEqual(convertEcsArnToResourceName(badArn), undefined)
        })
    })
})
