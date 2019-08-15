/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormation, Lambda, STS } from 'aws-sdk'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'

import '../../../shared/utilities/asyncIteratorShim'

async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

export class MockToolkitClientBuilder implements ToolkitClientBuilder {
    public constructor(
        private readonly cloudFormationClient: CloudFormationClient = new MockCloudFormationClient(),

        private readonly ecsClient: EcsClient = new MockEcsClient({}),

        private readonly lambdaClient: LambdaClient = new MockLambdaClient({}),

        private readonly stsClient: StsClient = new MockStsClient({})
    ) {
    }

    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return this.cloudFormationClient
    }

    public createEcsClient(regionCode: string): EcsClient {
        return this.ecsClient
    }

    public createLambdaClient(regionCode: string): LambdaClient {
        return this.lambdaClient
    }

    public createStsClient(regionCode: string): StsClient {
        return this.stsClient
    }
}

export class MockCloudFormationClient implements CloudFormationClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly deleteStack: (name: string) => Promise<void> =
            async (name: string) => { },

        public readonly listStacks: (statusFilter?: string[]) => AsyncIterableIterator<CloudFormation.StackSummary> =
            (statusFilter?: string[]) => asyncGenerator([]),

        public readonly describeStackResources: (name: string) => Promise<CloudFormation.DescribeStackResourcesOutput> =
            async (name: string) => ({
                StackResources: []
            })
    ) {
    }
}

export class MockEcsClient implements EcsClient {
    public readonly regionCode: string
    public readonly listClusters: () => AsyncIterableIterator<string>
    public readonly listServices: (cluster: string) => AsyncIterableIterator<string>
    public readonly listTaskDefinitionFamilies: () => AsyncIterableIterator<string>

    public constructor({
        regionCode = '',
        listClusters = () => asyncGenerator([]),
        listServices = (cluster: string) => asyncGenerator([]),
        listTaskDefinitionFamilies = () => asyncGenerator([])
    }: {
        regionCode?: string
        listClusters?(): AsyncIterableIterator<string>
        listServices?(cluster: string): AsyncIterableIterator<string>
        listTaskDefinitionFamilies?(): AsyncIterableIterator<string>
    }) {
        this.regionCode = regionCode
        this.listClusters = listClusters
        this.listServices = listServices
        this.listTaskDefinitionFamilies = listTaskDefinitionFamilies
    }
}

export class MockLambdaClient implements LambdaClient {
    public readonly regionCode: string
    public readonly deleteFunction: (name: string) => Promise<void>
    public readonly invoke: (name: string, payload?: Lambda._Blob) => Promise<Lambda.InvocationResponse>
    public readonly listFunctions: () => AsyncIterableIterator<Lambda.FunctionConfiguration>

    public constructor({
        regionCode = '',
        deleteFunction = async (name: string) => { },
        invoke = async (name: string, payload?: Lambda._Blob) => ({}),
        listFunctions = () => asyncGenerator([])

    }: {
        regionCode?: string
        deleteFunction?(name: string): Promise<void>
        invoke?(name: string, payload?: Lambda._Blob): Promise<Lambda.InvocationResponse>
        listFunctions?(): AsyncIterableIterator<Lambda.FunctionConfiguration>
    }) {
        this.regionCode = regionCode
        this.deleteFunction = deleteFunction
        this.invoke = invoke
        this.listFunctions = listFunctions
    }
}

export class MockStsClient implements StsClient {
    public readonly regionCode: string
    public readonly getCallerIdentity: () => Promise<STS.GetCallerIdentityResponse>

    public constructor({
        regionCode = '',
        getCallerIdentity = async () => ({})
    }: {
        regionCode?: string
        getCallerIdentity?(): Promise<STS.GetCallerIdentityResponse>
    }) {
        this.regionCode = regionCode
        this.getCallerIdentity = getCallerIdentity
    }
}
