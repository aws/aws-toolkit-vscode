/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CloudFormationV3 from '@aws-sdk/client-cloudformation'
import { AsyncCollection } from '../utilities/asyncCollection'
import { hasProps, isNonNullable, RequiredProps } from '../utilities/tsUtils'
import { ClientWrapper } from './clientWrapper'

export interface StackSummary
    extends RequiredProps<CloudFormationV3.StackSummary, 'StackName' | 'CreationTime' | 'StackStatus'> {
    DriftInformation: RequiredProps<CloudFormationV3.StackDriftInformation, 'StackDriftStatus'>
}

export type StackResource = RequiredProps<CloudFormationV3.StackResource, 'ResourceType'>

export interface DescribeStackResourcesOutput extends CloudFormationV3.DescribeStackResourcesOutput {
    StackResources: StackResource[]
}
export class CloudFormationClient extends ClientWrapper<CloudFormationV3.CloudFormationClient> {
    public constructor(regionCode: string) {
        super(regionCode, CloudFormationV3.CloudFormationClient)
    }

    public async deleteStack(name: string): Promise<CloudFormationV3.DeleteStackCommandOutput> {
        return await this.makeRequest(CloudFormationV3.DeleteStackCommand, { StackName: name })
    }

    public async describeType(typeName: string): Promise<CloudFormationV3.DescribeTypeOutput> {
        return await this.makeRequest(CloudFormationV3.DescribeTypeCommand, { TypeName: typeName })
    }

    public async *listStacks(
        statusFilter: CloudFormationV3.StackStatus[] = ['CREATE_COMPLETE', 'UPDATE_COMPLETE']
    ): AsyncIterableIterator<StackSummary> {
        const request: CloudFormationV3.ListStacksInput = {
            StackStatusFilter: statusFilter,
        }

        do {
            const response: CloudFormationV3.ListStacksOutput = await this.makeRequest(
                CloudFormationV3.ListStacksCommand,
                request
            )

            const filteredResponse = response.StackSummaries?.filter(isStackSummary)
            if (filteredResponse && filteredResponse.length > 0) {
                yield* filteredResponse
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public listAllStacks(request: CloudFormationV3.ListStacksInput = {}): AsyncCollection<StackSummary[]> {
        return this.makePaginatedRequest(
            CloudFormationV3.paginateListStacks,
            request,
            (page) => page.StackSummaries
        ).map((s) => s.filter(isStackSummary))
    }

    public async *listTypes(): AsyncIterableIterator<CloudFormationV3.TypeSummary> {
        const request: CloudFormationV3.ListTypesInput = {
            DeprecatedStatus: 'LIVE',
            Type: 'RESOURCE',
            Visibility: 'PUBLIC',
        }

        do {
            const response: CloudFormationV3.ListTypesOutput = await this.makeRequest(
                CloudFormationV3.ListTypesCommand,
                request
            )

            if (response.TypeSummaries) {
                yield* response.TypeSummaries
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async describeStackResources(name: string): Promise<DescribeStackResourcesOutput> {
        return await this.makeRequest(CloudFormationV3.DescribeStackResourcesCommand, { StackName: name })
    }
}

function isStackSummary(s: CloudFormationV3.StackSummary | undefined): s is StackSummary {
    return (
        isNonNullable(s) &&
        hasProps(s, 'StackName', 'CreationTime', 'StackStatus', 'DriftInformation') &&
        hasProps(s.DriftInformation, 'StackDriftStatus')
    )
}
