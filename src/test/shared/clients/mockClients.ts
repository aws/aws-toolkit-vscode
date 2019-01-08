/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CloudFormation, Lambda } from 'aws-sdk'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'

import '../../../shared/utilities/asyncIteratorShim'

async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

export class MockToolkitClientBuilder implements ToolkitClientBuilder {
    public constructor(
        private readonly cloudFormationClient: CloudFormationClient = new MockCloudFormationClient(),

        private readonly lambdaClient: LambdaClient = new MockLambdaClient()
    ) {
    }

    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return this.cloudFormationClient
    }

    public createLambdaClient(regionCode: string): LambdaClient {
        return this.lambdaClient
    }
}

export class MockCloudFormationClient implements CloudFormationClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly deleteStack: (name: string) => Promise<void> =
            async (name: string) => {},

        public readonly listStacks: (statusFilter?: string[]) => AsyncIterableIterator<CloudFormation.StackSummary> =
            (statusFilter?: string[]) => asyncGenerator([]),

        public readonly describeStackResources: (name: string) => Promise<CloudFormation.DescribeStackResourcesOutput> =
            async (name: string) => ({
                StackResources: []
            })
    ) {
    }
}

export class MockLambdaClient implements LambdaClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly deleteFunction: (name: string) => Promise<void> =
            async (name: string) => {},

        public readonly getFunctionConfiguration: (name: string) => Promise<Lambda.FunctionConfiguration> =
            async (name: string) => ({}),

        public readonly invoke: (name: string, payload?: Lambda._Blob) => Promise<Lambda.InvocationResponse> =
            async (name: string, payload?: Lambda._Blob) => ({}),

        public readonly getPolicy: (name: string) => Promise<Lambda.GetPolicyResponse> =
            async (name: string) => ({}),

        public readonly listFunctions: () => AsyncIterableIterator<Lambda.FunctionConfiguration> =
            () => asyncGenerator([])
    ) {
    }
}
