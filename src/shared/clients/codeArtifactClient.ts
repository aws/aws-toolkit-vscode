/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeArtifact } from 'aws-sdk'
import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'
export interface CodeArtifactDomain {
    domainName: string
    domainArn: string
    domainStatus: string
}
export interface CodeArtifactRepository {
    repositoryName: string
    repositoryArn: string
    repositoryDomainName: string
    repositoryDescription: string
}

export interface CodeArtifactPackage {
    packageFormat: string
    packageNamespace: string
    packageName: string
    packageFullName: string
}

export interface CodeArtifactPackageVersion {
    versionName: string
    versionStatus: string
}

export type CodeArtifactClient = ClassToInterfaceType<DefaultCodeArtifactClient>
export class DefaultCodeArtifactClient {
    public constructor(public readonly regionCode: string) {}

    public async *listPackageVersions(
        domainName: string,
        repositoryName: string,
        format: string,
        namespace: string,
        packageName: string
    ): AsyncIterableIterator<CodeArtifactPackageVersion> {
        const sdkClient = await this.createSdkClient()
        const request: CodeArtifact.ListPackageVersionsRequest = {
            domain: domainName,
            repository: repositoryName,
            format: format,
            namespace: namespace,
            package: packageName,
        }
        do {
            const response = await sdkClient.listPackageVersions(request).promise()
            if (response.versions) {
                yield* response.versions
                    .map(version => {
                        // If any of these are not present, the version returned is not valid.
                        if (!version.version || !version.status) {
                            return undefined
                        } else {
                            return {
                                versionName: version.version,
                                versionStatus: version.status,
                            }
                        }
                    })
                    .filter(item => item !== undefined) as CodeArtifactPackageVersion[]
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listDomains(): AsyncIterableIterator<CodeArtifactDomain> {
        const sdkClient = await this.createSdkClient()
        const request: CodeArtifact.ListDomainsRequest = {}
        do {
            const response = await sdkClient.listDomains(request).promise()
            if (response.domains) {
                yield* response.domains
                    .map(domain => {
                        // If any of these are not present, the domain returned is not valid. Arn
                        // is based on name, and it's not possible to not have a name
                        if (!domain.name || !domain.arn || !domain.status) {
                            return undefined
                        } else {
                            return {
                                domainName: domain.name,
                                domainStatus: domain.status,
                                domainArn: domain.arn,
                            }
                        }
                    })
                    .filter(item => item !== undefined) as CodeArtifactDomain[]
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listRepositoriesInDomain(domainName: string): AsyncIterableIterator<CodeArtifactRepository> {
        const sdkClient = await this.createSdkClient()
        const request: CodeArtifact.ListRepositoriesInDomainRequest = { domain: domainName }
        do {
            const response = await sdkClient.listRepositoriesInDomain(request).promise()
            if (response.repositories) {
                yield* response.repositories
                    .map(repo => {
                        // If any of these are not present, the repo returned is not valid. repositoryUri/Arn
                        // are both based on name, and it's not possible to not have a name
                        if (!repo.arn || !repo.name || !repo.description) {
                            return undefined
                        } else {
                            return {
                                repositoryName: repo.name,
                                repositoryDescription: repo.description,
                                repositoryArn: repo.arn,
                            }
                        }
                    })
                    .filter(item => item !== undefined) as CodeArtifactRepository[]
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listPackages(domainName: string, repositoryName: string): AsyncIterableIterator<CodeArtifactPackage> {
        const sdkClient = await this.createSdkClient()
        const request: CodeArtifact.ListPackagesRequest = { domain: domainName, repository: repositoryName }
        do {
            const response = await sdkClient.listPackages(request).promise()
            if (response.packages) {
                yield* response.packages
                    .map(artifact => {
                        // If any of these are not present, the package returned is not valid
                        if (!artifact.format || !artifact.namespace || !artifact.package) {
                            return undefined
                        } else {
                            const item = {
                                packageFormat: artifact.format,
                                packageNamespace: artifact.namespace,
                                packageName: artifact.package,
                                packageFullName: artifact.package,
                            }
                            if (artifact.format == 'npm') {
                                item.packageFullName = `@${artifact.namespace}/${artifact.package}`
                            } else if (artifact.format == 'maven') {
                                item.packageFullName = `${artifact.namespace}.${artifact.package}`
                            }

                            return item
                        }
                    })
                    .filter(item => item !== undefined) as CodeArtifactPackage[]
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async createRepository(repositoryName: string): Promise<void> {
        // const sdkClient = await this.createSdkClient()
        // await sdkClient.createRepository({ repositoryName: repositoryName }).promise()
    }

    public async deleteDomain(domainName: string): Promise<void> {
        // const sdkClient = await this.createSdkClient()
        // await sdkClient.deleteRepository({ repositoryName: repositoryName }).promise()
    }

    public async deleteRepository(repositoryName: string): Promise<void> {
        // const sdkClient = await this.createSdkClient()
        // await sdkClient.deleteRepository({ repositoryName: repositoryName }).promise()
    }

    public async deleteTag(repositoryName: string, tag: string): Promise<void> {
        // const sdkClient = await this.createSdkClient()
        // await sdkClient.batchDeleteImage({ repositoryName: repositoryName, imageIds: [{ imageTag: tag }] }).promise()
    }

    protected async createSdkClient(): Promise<CodeArtifact> {
        return await globals.sdkClientBuilder.createAwsService(CodeArtifact, undefined, this.regionCode)
    }
}
