/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { getLogger } from '../logger'
import { getUserAgent } from '../telemetry/util'
import { ToolkitError } from '../errors'
import { InterfaceNoSymbol } from '../utilities/tsUtils'
import * as DocDB from '@aws-sdk/client-docdb'
import * as DocDBElastic from '@aws-sdk/client-docdb-elastic'
import { OrderableDBInstanceOption } from '@aws-sdk/client-docdb'

const DocDBEngine = 'docdb'

function isElasticCluster(clusterId: string): boolean {
    return clusterId?.includes(':docdb-elastic:')
}

export const DBStorageType = { Standard: 'standard', IOpt1: 'iopt1' } as const

/**
 * <p>A list of Amazon DocumentDB clusters.</p>
 * @public
 */
export interface DBElasticCluster extends DocDBElastic.ClusterInList {}

export interface DBInstance extends DocDB.DBInstance {
    IsClusterWriter?: boolean
}

export type DocumentDBClient = InterfaceNoSymbol<DefaultDocumentDBClient>

export class DefaultDocumentDBClient {
    public constructor(public readonly regionCode: string) {}

    private async getSdkConfig() {
        const credentials = await globals.awsContext.getCredentials()
        return {
            customUserAgent: await getUserAgent({ includePlatform: true, includeClientId: true }),
            credentials: credentials,
            region: this.regionCode,
        }
    }

    public async getClient(): Promise<DocDB.DocDBClient> {
        const config = await this.getSdkConfig()
        return new DocDB.DocDBClient(config)
    }

    public async getElasticClient(): Promise<DocDBElastic.DocDBElasticClient> {
        const config = await this.getSdkConfig()
        return new DocDBElastic.DocDBElasticClient(config)
    }

    public async listEngineVersions(): Promise<DocDB.DBEngineVersion[]> {
        getLogger().debug('ListEngineVersions called')
        const client = await this.getClient()

        try {
            const command = new DocDB.DescribeDBEngineVersionsCommand({ Engine: DocDBEngine })
            const response = await client.send(command)
            return response.DBEngineVersions ?? []
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get DocumentDB engine versions')
        }
    }

    // Ideally, we would return AsyncCollection or iterator
    public async listInstanceClassOptions(
        engineVersion: string | undefined,
        storageType: string | undefined
    ): Promise<DocDB.OrderableDBInstanceOption[]> {
        getLogger().debug('ListInstanceClassOptions called')
        const client = await this.getClient()

        try {
            const instanceClasses: OrderableDBInstanceOption[] = []
            const input = {
                Engine: DocDBEngine,
                EngineVersion: engineVersion,
            }
            const paginator = DocDB.paginateDescribeOrderableDBInstanceOptions({ client }, input)
            for await (const page of paginator) {
                instanceClasses.push(...(page.OrderableDBInstanceOptions ?? []))
            }

            return instanceClasses.filter(ic => storageType === ic.StorageType || storageType === undefined)
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get instance classes')
        }
    }

    public async listClusters(): Promise<DocDB.DBCluster[]> {
        getLogger().debug('ListClusters called')
        const client = await this.getClient()

        try {
            const input = {
                Filters: [{ Name: 'engine', Values: [DocDBEngine] }],
            }
            const command = new DocDB.DescribeDBClustersCommand(input)
            const response = await client.send(command)
            return response.DBClusters ?? []
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get DocumentDB clusters')
        }
    }

    public async listInstances(clusters: string[] = []): Promise<DBInstance[]> {
        getLogger().debug('ListInstances called')
        const client = await this.getClient()

        try {
            const input: DocDB.DescribeDBInstancesCommandInput = {}
            if (clusters?.length > 0) {
                input.Filters = [{ Name: 'db-cluster-id', Values: clusters }]
            }
            const command = new DocDB.DescribeDBInstancesCommand(input)
            const response = await client.send(command)
            return response.DBInstances ?? []
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get DocumentDB instances')
        }
    }

    public async listElasticClusters(): Promise<DBElasticCluster[]> {
        getLogger().debug('ListElasticClusters called')
        const client = await this.getElasticClient()

        try {
            const command = new DocDBElastic.ListClustersCommand()
            const response = await client.send(command)
            return response.clusters ?? []
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get DocumentDB elastic clusters')
        }
    }

    public async createCluster(input: DocDB.CreateDBClusterMessage): Promise<DocDB.DBCluster | undefined> {
        getLogger().debug('CreateCluster called')
        const client = await this.getClient()

        try {
            const command = new DocDB.CreateDBClusterCommand(input)
            const response = await client.send(command)
            return response.DBCluster
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to create DocumentDB cluster')
        }
    }

    public async startCluster(clusterId: string) {
        getLogger().debug('StartCluster called')
        try {
            if (isElasticCluster(clusterId)) {
                const client = await this.getElasticClient()
                const command = new DocDBElastic.StartClusterCommand({ clusterArn: clusterId })
                await client.send(command)
            } else {
                const client = await this.getClient()
                const command = new DocDB.StartDBClusterCommand({ DBClusterIdentifier: clusterId })
                await client.send(command)
            }
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to start DocumentDB cluster')
        }
    }

    public async stopCluster(clusterId: string) {
        getLogger().debug('StopCluster called')
        try {
            if (isElasticCluster(clusterId)) {
                const client = await this.getElasticClient()
                const command = new DocDBElastic.StopClusterCommand({ clusterArn: clusterId })
                await client.send(command)
            } else {
                const client = await this.getClient()
                const command = new DocDB.StopDBClusterCommand({ DBClusterIdentifier: clusterId })
                await client.send(command)
            }
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to stop DocumentDB cluster')
        }
    }

    public async createInstance(input: DocDB.CreateDBInstanceMessage): Promise<DocDB.DBInstance | undefined> {
        getLogger().debug('CreateInstance called')
        const client = await this.getClient()

        try {
            const command = new DocDB.CreateDBInstanceCommand(input)
            const response = await client.send(command)
            return response.DBInstance
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to create DocumentDB instance')
        }
    }

    public async deleteInstance(input: DocDB.DeleteDBInstanceMessage): Promise<DocDB.DBInstance | undefined> {
        getLogger().debug('DeleteInstance called')
        const client = await this.getClient()

        try {
            const command = new DocDB.DeleteDBInstanceCommand(input)
            const response = await client.send(command)
            return response.DBInstance
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to delete DocumentDB instance')
        }
    }
}
