/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormation } from 'aws-sdk'

export interface CloudFormationClient {
    readonly regionCode: string

    deleteStack(name: string): Promise<void>

    listStacks(statusFilter?: string[]): AsyncIterableIterator<CloudFormation.StackSummary>

    describeStackResources(name: string): Promise<CloudFormation.DescribeStackResourcesOutput>
}
