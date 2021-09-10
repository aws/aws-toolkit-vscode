/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormation } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import '../utilities/asyncIteratorShim'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type CloudFormationClient = ClassToInterfaceType<DefaultCloudFormationClient>
export class DefaultCloudFormationClient {
    public constructor(public readonly regionCode: string) {}

    public async deleteStack(name: string): Promise<void> {
        const client = await this.createSdkClient()

        await client
            .deleteStack({
                StackName: name,
            })
            .promise()
    }

    public async *listStacks(
        statusFilter: string[] = ['CREATE_COMPLETE', 'UPDATE_COMPLETE']
    ): AsyncIterableIterator<CloudFormation.StackSummary> {
        const client = await this.createSdkClient()

        const request: CloudFormation.ListStacksInput = {
            StackStatusFilter: statusFilter,
        }

        do {
            const response: CloudFormation.ListStacksOutput = await client.listStacks(request).promise()

            if (response.StackSummaries) {
                yield* response.StackSummaries
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async describeStackResources(name: string): Promise<CloudFormation.DescribeStackResourcesOutput> {
        const client = await this.createSdkClient()

        return await client
            .describeStackResources({
                StackName: name,
            })
            .promise()
    }

    private async createSdkClient(): Promise<CloudFormation> {
        return await ext.sdkClientBuilder.createAwsService(CloudFormation, undefined, this.regionCode)
    }
}
