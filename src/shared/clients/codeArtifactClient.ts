/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeArtifact } from 'aws-sdk'
import globals from '../extensionGlobals'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { ClassToInterfaceType, isNonNullable } from '../utilities/tsUtils'

export type CodeArtifactClient = ClassToInterfaceType<DefaultCodeArtifactClient>

export class DefaultCodeArtifactClient {
    public constructor(public readonly regionCode: string) {}

    public listDomains(request: CodeArtifact.ListDomainsRequest = {}): AsyncCollection<CodeArtifact.DomainSummary[]> {
        const client = this.createSdkClient()
        const requester = async (req: CodeArtifact.ListDomainsRequest) => (await client).listDomains(req).promise()
        const collection = pageableToCollection(requester, request, 'nextToken', 'domains')

        return collection.filter(isNonNullable).map(async domains => {
            if (domains.length === 0) {
                return []
            }

            return domains
        })
    }

    public listRepositoriesInDomain(
        request: CodeArtifact.ListRepositoriesInDomainRequest
    ): AsyncCollection<CodeArtifact.RepositorySummary[]> {
        const client = this.createSdkClient()
        const requester = async (req: CodeArtifact.ListRepositoriesInDomainRequest) =>
            (await client).listRepositoriesInDomain(req).promise()
        const collection = pageableToCollection(requester, request, 'nextToken', 'repositories')

        return collection.filter(isNonNullable).map(async repositories => {
            if (repositories.length === 0) {
                return []
            }

            return repositories
        })
    }

    public listPackages(
        request: CodeArtifact.ListPackagesRequest
    ): AsyncCollection<CodeArtifact.PackageSummary[]> {
        const client = this.createSdkClient()
        const requester = async (req: CodeArtifact.ListPackagesRequest) => (await client).listPackages(req).promise()
        const collection = pageableToCollection(requester, request, 'nextToken', 'packages')

        return collection.filter(isNonNullable).map(async packages => {
            if (packages.length === 0) {
                return []
            }

            return packages
        })
    }

    public listPackageVersions(
        request: CodeArtifact.ListPackageVersionsRequest
    ): AsyncCollection<CodeArtifact.PackageVersionSummary[]> {
        const client = this.createSdkClient()
        const requester = async (req: CodeArtifact.ListPackageVersionsRequest) =>
            (await client).listPackageVersions(req).promise()
        const collection = pageableToCollection(requester, request, 'nextToken', 'versions')

        return collection.filter(isNonNullable).map(async versions => {
            if (versions.length === 0) {
                return []
            }

            return versions
        })
    }

    protected async createSdkClient(): Promise<CodeArtifact> {
        return await globals.sdkClientBuilder.createAwsService(CodeArtifact, undefined, this.regionCode)
    }
}
