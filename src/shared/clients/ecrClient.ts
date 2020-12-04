/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EcrRepository {
    repositoryName: string
    repositoryArn: string
    repositoryUri: string
}

export interface EcrClient {
    readonly regionCode: string
    describeRepositories(): AsyncIterableIterator<EcrRepository>
    describeTags(repositoryName: string): AsyncIterableIterator<string>
    deleteRepository(repositoryName: string): Promise<void>
    deleteTag(repositoryName: string, tag: string): Promise<void>
    createRepository(repositoryName: string): Promise<void>
}
