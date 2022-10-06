/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CodeArtifact as CA } from 'aws-sdk'
import { DefaultCodeArtifactClient } from '../shared/clients/codeArtifactClient'

import { ResourceTreeNode } from '../shared/treeview/resource'
import { getIcon } from '../shared/icons'
import { AsyncCollection } from '../shared/utilities/asyncCollection'

class PackageVersion {
    public readonly id = this.packageVersion.version!

    public constructor(private readonly packageVersion: CA.PackageVersionSummary) {}

    public getTreeItem() {
        const item = new vscode.TreeItem(this.packageVersion.version!)
        item.tooltip = this.packageVersion.version!
        item.contextValue = 'awsCodeArtifactPackageVersionNode'

        return item
    }

    public toTreeNode(): ResourceTreeNode<this> {
        return new ResourceTreeNode(this)
    }
}

class Package {
    public readonly id = this.artifact.package!

    public constructor(
        private readonly client: DefaultCodeArtifactClient,
        private readonly artifact: CA.PackageSummary,
        private readonly repository: CA.RepositorySummary
    ) {}

    public listPackageVersions(): AsyncCollection<PackageVersion[]> {
        return this.client
            .listPackageVersions({
                domain: this.repository.domainName!,
                repository: this.repository.name!,
                namespace: this.artifact.namespace!,
                package: this.artifact.package!,
                format: this.artifact.format!,
                sortBy: 'PUBLISHED_TIME',
            })
            .map(packages => packages.map(s => new PackageVersion(s)))
    }

    public getTreeItem() {
        let packageFullName: string
        if (this.artifact.format == 'npm') {
            packageFullName = `@${this.artifact.namespace}/${this.artifact.package}`
        } else if (this.artifact.format == 'maven') {
            packageFullName = `${this.artifact.namespace}.${this.artifact.package}`
        } else {
            packageFullName = this.artifact.package!
        }

        const item = new vscode.TreeItem(packageFullName)
        item.tooltip = this.artifact.package!
        item.iconPath = getIcon('vscode-package')
        item.description = this.artifact.format
        item.contextValue = 'awsCodeArtifactPackageNode'

        return item
    }

    public toTreeNode(): ResourceTreeNode<this, PackageVersion> {
        return new ResourceTreeNode(this, {
            placeholder: localize('AWS.explorerNode.codeArtifact.noPackageVersions', '[No Package Versions found]'),
            childrenProvider: {
                paginated: true,
                listResources: () =>
                    this.listPackageVersions().map(packageVersions => packageVersions.map(s => s.toTreeNode())),
            },
            sort: (item1, item2) => item2.id.localeCompare(item1.id, undefined, { numeric: true }),
        })
    }
}

class Repository {
    public readonly id = this.repository.name!

    public constructor(
        private readonly client: DefaultCodeArtifactClient,
        private readonly repository: CA.RepositorySummary
    ) {}

    public listPackages(): AsyncCollection<Package[]> {
        return this.client
            .listPackages({ domain: this.repository.domainName!, repository: this.repository.name! })
            .map(packages => packages.map(s => new Package(this.client, s, this.repository)))
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.repository.name!)
        item.tooltip = this.repository.name!
        item.iconPath = getIcon('vscode-repo')
        item.contextValue = 'awsCodeArtifactRepositoryNode'

        return item
    }

    public toTreeNode(): ResourceTreeNode<this, Package> {
        return new ResourceTreeNode(this, {
            placeholder: localize('AWS.explorerNode.codeArtifact.noPackages', '[No Packages found]'),
            childrenProvider: {
                paginated: true,
                listResources: () => this.listPackages().map(packages => packages.map(s => s.toTreeNode())),
            },
        })
    }
}

class Domain {
    public readonly id = this.domain.name!

    public constructor(private readonly client: DefaultCodeArtifactClient, private readonly domain: CA.DomainSummary) {}

    public listRepositories(): AsyncCollection<Repository[]> {
        return this.client
            .listRepositoriesInDomain({ domain: this.domain.name! })
            .map(repositories => repositories.map(s => new Repository(this.client, s)))
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.domain.name!)
        item.tooltip = this.domain.arn!
        item.iconPath = getIcon('vscode-globe')
        item.contextValue = 'awsCodeArtifactDomainNode'

        return item
    }

    public toTreeNode(): ResourceTreeNode<this, Repository> {
        return new ResourceTreeNode(this, {
            placeholder: localize('AWS.explorerNode.codeArtifact.noRepositories', '[No Repositories found]'),
            childrenProvider: {
                paginated: true,
                listResources: () => this.listRepositories().map(repositories => repositories.map(s => s.toTreeNode())),
            },
        })
    }
}

class CodeArtifact {
    public readonly id = 'codeartifact'
    public constructor(private readonly client: DefaultCodeArtifactClient) {}

    public getTreeItem() {
        const item = new vscode.TreeItem('CodeArtifact')
        item.contextValue = 'awsCodeArtifactsNode'

        return item
    }

    public listDomains(): AsyncCollection<Domain[]> {
        return this.client.listDomains().map(domains => domains.map(c => new Domain(this.client, c)))
    }
}

export function getCodeArtifactRootNode(region: string) {
    const controller = new CodeArtifact(new DefaultCodeArtifactClient(region))

    return new ResourceTreeNode(controller, {
        placeholder: localize('AWS.explorerNode.codeArtifact.noDomains', '[No Domains found]'),
        childrenProvider: {
            paginated: true,
            listResources: () => controller.listDomains().map(domains => domains.map(c => c.toTreeNode())),
        },
    })
}
