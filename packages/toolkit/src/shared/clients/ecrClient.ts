/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECR } from 'aws-sdk'
import globals from '../extensionGlobals'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { assertHasProps, ClassToInterfaceType, isNonNullable, RequiredProps } from '../utilities/tsUtils'

export type EcrRepository = RequiredProps<ECR.Repository, 'repositoryName' | 'repositoryUri' | 'repositoryArn'>

export type EcrClient = ClassToInterfaceType<DefaultEcrClient>
export class DefaultEcrClient {
    public constructor(public readonly regionCode: string) {}

    public async *describeTags(repositoryName: string): AsyncIterableIterator<string> {
        const sdkClient = await this.createSdkClient()
        const request: ECR.DescribeImagesRequest = { repositoryName: repositoryName }
        do {
            const response = await sdkClient.describeImages(request).promise()
            if (response.imageDetails) {
                for (const item of response.imageDetails) {
                    if (item.imageTags !== undefined) {
                        for (const tag of item.imageTags) {
                            yield tag
                        }
                    }
                }
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *describeRepositories(): AsyncIterableIterator<EcrRepository> {
        const sdkClient = await this.createSdkClient()
        const request: ECR.DescribeRepositoriesRequest = {}
        do {
            const response = await sdkClient.describeRepositories(request).promise()
            if (response.repositories) {
                yield* response.repositories
                    .map(repo => {
                        // If any of these are not present, the repo returned is not valid. repositoryUri/Arn
                        // are both based on name, and it's not possible to not have a name
                        if (!repo.repositoryArn || !repo.repositoryName || !repo.repositoryUri) {
                            return undefined
                        } else {
                            return {
                                repositoryName: repo.repositoryName,
                                repositoryUri: repo.repositoryUri,
                                repositoryArn: repo.repositoryArn,
                            }
                        }
                    })
                    .filter(item => item !== undefined) as EcrRepository[]
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public listAllRepositories(): AsyncCollection<EcrRepository[]> {
        const requester = async (req: ECR.DescribeRepositoriesRequest) =>
            (await this.createSdkClient()).describeRepositories(req).promise()
        const collection = pageableToCollection(requester, {}, 'nextToken', 'repositories')

        return collection.filter(isNonNullable).map(list => list.map(repo => (assertHasProps(repo), repo)))
    }

    public async createRepository(repositoryName: string) {
        const sdkClient = await this.createSdkClient()
        return sdkClient.createRepository({ repositoryName: repositoryName }).promise()
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
        return await globals.sdkClientBuilder.createAwsService(ECR, undefined, this.regionCode)
    }
}
