/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormation } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import '../utilities/asyncIteratorShim'
import { AsyncCollection, pageableToCollection } from '../utilities/collectionUtils'
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

    public listStacks(request: CloudFormation.ListStacksInput = {}): AsyncCollection<CloudFormation.StackSummary[]> {
        const client = this.createSdkClient()
        const requester = async (request: CloudFormation.ListStacksInput) =>
            (await client).listStacks(request).promise()
        request.StackStatusFilter = request.StackStatusFilter ?? ['CREATE_COMPLETE', 'UPDATE_COMPLETE']

        return pageableToCollection(requester, request, 'NextToken', 'StackSummaries').map(i => i ?? [])
    }

    public listAllStacks(request: CloudFormation.ListStacksInput = {}): Promise<CloudFormation.StackSummary[]> {
        return this.listStacks(request).flatten().promise()
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
