/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECR } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { AsyncCollection, pageableToCollection } from '../utilities/collectionUtils'
import { ClassToInterfaceType } from '../utilities/tsUtils'
export interface EcrRepository {
    repositoryName: string
    repositoryArn: string
    repositoryUri: string
}

export type EcrClient = ClassToInterfaceType<DefaultEcrClient>
export class DefaultEcrClient {
    public constructor(public readonly regionCode: string) {}

    public describeTags(request: ECR.DescribeImagesRequest): AsyncCollection<string[]> {
        const sdkClient = this.createSdkClient()
        const requester = async (request: ECR.DescribeImagesRequest) =>
            (await sdkClient).describeImages(request).promise()
        const collection = pageableToCollection(requester, request, 'nextToken', 'imageDetails')

        return collection.map(details => (details ?? []).map(d => d.imageTags ?? [])).flatten()
    }

    public describeAllTags(request: ECR.DescribeImagesRequest): Promise<string[]> {
        return this.describeTags(request).flatten().promise()
    }

    public describeRepositories(request: ECR.DescribeRepositoriesRequest = {}): AsyncCollection<EcrRepository[]> {
        const sdkClient = this.createSdkClient()
        const requester = async (request: ECR.DescribeRepositoriesRequest) =>
            (await sdkClient).describeRepositories(request).promise()

        function isEcrRepository(repo: any): repo is EcrRepository {
            return repo.repositoryArn && repo.repositoryName && repo.repositoryUri
        }

        return pageableToCollection(requester, request, 'nextToken', 'repositories').map(l =>
            (l ?? []).filter(isEcrRepository)
        )
    }

    public describeAllRepositories(request: ECR.DescribeRepositoriesRequest = {}): Promise<EcrRepository[]> {
        return this.describeRepositories(request).flatten().promise()
    }

    public async createRepository(repositoryName: string): Promise<void> {
        const sdkClient = await this.createSdkClient()
        await sdkClient.createRepository({ repositoryName: repositoryName }).promise()
    }

    public async deleteRepository(repositoryName: string): Promise<void> {
        const sdkClient = await this.createSdkClient()
        await sdkClient.deleteRepository({ repositoryName: repositoryName }).promise()
    }

    public async deleteTag(repositoryName: string, tag: string): Promise<void> {
        const sdkClient = await this.createSdkClient()
        await sdkClient.batchDeleteImage({ repositoryName: repositoryName, imageIds: [{ imageTag: tag }] }).promise()
    }

    protected async createSdkClient(): Promise<ECR> {
        return await ext.sdkClientBuilder.createAwsService(ECR, undefined, this.regionCode)
    }
}
