/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    CloudFormation,
    DescribeStackResourcesCommandOutput,
    DescribeTypeCommandOutput,
    ListStacksCommandInput,
    ListStacksCommandOutput,
    ListTypesCommandInput,
    ListTypesCommandOutput,
    StackSummary,
    TypeSummary,
} from "@aws-sdk/client-cloudformation";

import globals from '../extensionGlobals'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { ClassToInterfaceType, isNonNullable } from '../utilities/tsUtils'

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

    public async describeType(typeName: string): Promise<DescribeTypeCommandOutput> {
        const client = await this.createSdkClient()

        return await client
            .describeType({
                Type: 'RESOURCE',
                TypeName: typeName,
            })
            .promise()
    }

    public async *listStacks(
        statusFilter: string[] = ['CREATE_COMPLETE', 'UPDATE_COMPLETE']
    ): AsyncIterableIterator<StackSummary> {
        const client = await this.createSdkClient()

        const request: ListStacksCommandInput = {
            StackStatusFilter: statusFilter,
        }

        do {
            const response: ListStacksCommandOutput = await client.listStacks(request).promise()

            if (response.StackSummaries) {
                yield* response.StackSummaries
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public listAllStacks(request: ListStacksCommandInput = {}): AsyncCollection<StackSummary[]> {
        const client = this.createSdkClient()
        const requester = async (req: ListStacksCommandInput) => (await client).listStacks(req).promise()
        const collection = pageableToCollection(requester, request, 'NextToken', 'StackSummaries')

        return collection.filter(isNonNullable)
    }

    public async *listTypes(): AsyncIterableIterator<TypeSummary> {
        const client = await this.createSdkClient()

        const request: ListTypesCommandInput = {
            DeprecatedStatus: 'LIVE',
            Type: 'RESOURCE',
            Visibility: 'PUBLIC',
        }

        do {
            const response: ListTypesCommandOutput = await client.listTypes(request).promise()

            if (response.TypeSummaries) {
                yield* response.TypeSummaries
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async describeStackResources(name: string): Promise<DescribeStackResourcesCommandOutput> {
        const client = await this.createSdkClient()

        return await client
            .describeStackResources({
                StackName: name,
            })
            .promise()
    }

    private async createSdkClient(): Promise<CloudFormation> {
        return await globals.sdkClientBuilder.createAwsService(CloudFormation, undefined, this.regionCode)
    }
}
