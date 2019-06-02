/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { AWSError, CloudFormation, Lambda, S3, STS } from 'aws-sdk'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { S3Client } from '../../../shared/clients/s3Client'
import { StsClient } from '../../../shared/clients/stsClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'

import '../../../shared/utilities/asyncIteratorShim'

async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

export class MockToolkitClientBuilder implements ToolkitClientBuilder {
    public constructor(
        private readonly cloudFormationClient: CloudFormationClient = new MockCloudFormationClient(),

        private readonly lambdaClient: LambdaClient = new MockLambdaClient({}),

        private readonly stsClient: StsClient = new MockStsClient({})
    ) {
    }

    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return this.cloudFormationClient
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

export class MockS3Client implements S3Client {
    public constructor (
        private readonly bucketToRegion: Map<string, string>
    ) { }

    public async getBucketLocation(bucket: string): Promise<S3.GetBucketLocationOutput> {
        const region = this.bucketToRegion.get(bucket)
        if (!region) {
            throw new AWSError('bucket not found')
        }

        const valueToReturn: S3.GetBucketLocationOutput = {
            LocationConstraint: region
        }

        return await latencyGenerator(valueToReturn)
    }

    public async listBuckets(): Promise<S3.ListBucketsOutput> {
        const response: S3.ListBucketsOutput = {
            Buckets: [],
            // this is sample text from the docs:
            // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listBuckets-property
            Owner: {
                DisplayName: 'own-display-name',
                ID: 'examplee7a2f25102679df27bb0ae12b3f85be6f290b936c4393484be31'
            }
        }

        const buckets = this.bucketToRegion.keys()
        for (const bucket of buckets) {
            response.Buckets!.push({
                CreationDate: new Date(),
                Name: bucket
            })
        }

        return await latencyGenerator(response)
    }
}

// generates a random call latency from 0-50 ms
async function latencyGenerator<T>(valueToReturn: T): Promise<T> {
    return new Promise<T>((resolve) => {
        setTimeout(
            () => resolve(valueToReturn),
            Math.random() * 50
        )
    })
}
