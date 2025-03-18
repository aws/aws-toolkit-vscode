/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CloudFormation from '@aws-sdk/client-cloudformation'
import { AsyncCollection } from '../utilities/asyncCollection'
import { hasProps, isNonNullable, RequiredProps } from '../utilities/tsUtils'
import { ClientWrapper } from './clientWrapper'

export interface StackSummary
    extends RequiredProps<CloudFormation.StackSummary, 'StackName' | 'CreationTime' | 'StackStatus'> {
    DriftInformation: RequiredProps<CloudFormation.StackDriftInformation, 'StackDriftStatus'>
}

export type StackResource = RequiredProps<CloudFormation.StackResource, 'ResourceType'>

export interface DescribeStackResourcesOutput extends CloudFormation.DescribeStackResourcesOutput {
    StackResources: StackResource[]
}
export class CloudFormationClient extends ClientWrapper<CloudFormation.CloudFormationClient> {
    public constructor(regionCode: string) {
        super(regionCode, CloudFormation.CloudFormationClient)
    }

    public async deleteStack(name: string): Promise<CloudFormation.DeleteStackCommandOutput> {
        return await this.makeRequest(CloudFormation.DeleteStackCommand, { StackName: name })
    }

    public async describeType(typeName: string): Promise<CloudFormation.DescribeTypeOutput> {
        return await this.makeRequest(CloudFormation.DescribeTypeCommand, { TypeName: typeName })
    }

    public async *listStacks(
        statusFilter: CloudFormation.StackStatus[] = ['CREATE_COMPLETE', 'UPDATE_COMPLETE']
    ): AsyncIterableIterator<StackSummary> {
        const request: CloudFormation.ListStacksInput = {
            StackStatusFilter: statusFilter,
        }

        do {
            const response: CloudFormation.ListStacksOutput = await this.makeRequest(
                CloudFormation.ListStacksCommand,
                request
            )

            const filteredResponse = response.StackSummaries?.filter(isStackSummary)
            if (filteredResponse && filteredResponse.length > 0) {
                yield* filteredResponse
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public listAllStacks(request: CloudFormation.ListStacksInput = {}): AsyncCollection<StackSummary[]> {
        return this.makePaginatedRequest(CloudFormation.paginateListStacks, request, (page) => page.StackSummaries).map(
            (s) => s.filter(isStackSummary)
        )
    }

    public async *listTypes(): AsyncIterableIterator<CloudFormation.TypeSummary> {
        const request: CloudFormation.ListTypesInput = {
            DeprecatedStatus: 'LIVE',
            Type: 'RESOURCE',
            Visibility: 'PUBLIC',
        }

        do {
            const response: CloudFormation.ListTypesOutput = await this.makeRequest(
                CloudFormation.ListTypesCommand,
                request
            )

            if (response.TypeSummaries) {
                yield* response.TypeSummaries
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async describeStackResources(name: string): Promise<DescribeStackResourcesOutput> {
        return await this.makeRequest(CloudFormation.DescribeStackResourcesCommand, { StackName: name })
    }
}

function isStackSummary(s: CloudFormation.StackSummary | undefined): s is StackSummary {
    return (
        isNonNullable(s) &&
        hasProps(s, 'StackName', 'CreationTime', 'StackStatus', 'DriftInformation') &&
        hasProps(s.DriftInformation, 'StackDriftStatus')
    )
}
