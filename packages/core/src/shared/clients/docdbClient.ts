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

const DocDBEngine = 'docdb'

function isElasticCluster(clusterId: string): boolean {
    return clusterId?.includes(':docdb-elastic:')
}

export const DBStorageType = { Standard: 'standard', IOpt1: 'iopt1' } as const

/** A list of Amazon DocumentDB clusters. */
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
            customUserAgent: getUserAgent({ includePlatform: true, includeClientId: true }),
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

    private async executeCommand<TOutput extends DocDB.ServiceOutputTypes>(command: any): Promise<TOutput> {
        getLogger().debug(`${command.constructor.name} called`)
        const client = await this.getClient()
        try {
            return await client.send(command)
        } catch (e) {
            throw ToolkitError.chain(e, `Failed to execute command: ${command.constructor.name}`)
        } finally {
            client.destroy()
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
            const instanceClasses: DocDB.OrderableDBInstanceOption[] = []
            const input = {
                Engine: DocDBEngine,
                EngineVersion: engineVersion,
            }
            const paginator = DocDB.paginateDescribeOrderableDBInstanceOptions({ client }, input)
            for await (const page of paginator) {
                instanceClasses.push(...(page.OrderableDBInstanceOptions ?? []))
            }

            return instanceClasses.filter((ic) => storageType === ic.StorageType || storageType === undefined)
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get instance classes')
        } finally {
            client.destroy()
        }
    }

    public async listEngineVersions(): Promise<DocDB.DBEngineVersion[]> {
        const command = new DocDB.DescribeDBEngineVersionsCommand({ Engine: DocDBEngine })
        const response = await this.executeCommand<DocDB.DescribeDBEngineVersionsCommandOutput>(command)
        return response.DBEngineVersions ?? []
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
        } finally {
            client.destroy()
        }
    }

    public async listClusters(clusterId: string | undefined = undefined): Promise<DocDB.DBCluster[]> {
        const input: DocDB.DescribeDBClustersCommandInput = {
            Filters: [{ Name: 'engine', Values: [DocDBEngine] }],
            DBClusterIdentifier: clusterId,
        }
        const command = new DocDB.DescribeDBClustersCommand(input)
        const response = await this.executeCommand<DocDB.DescribeDBClustersCommandOutput>(command)
        return response.DBClusters ?? []
    }

    public async listInstances(clusters: string[] = []): Promise<DBInstance[]> {
        const input: DocDB.DescribeDBInstancesCommandInput = {}
        if (clusters?.length > 0) {
            input.Filters = [{ Name: 'db-cluster-id', Values: clusters }]
        }
        const command = new DocDB.DescribeDBInstancesCommand(input)
        const response = await this.executeCommand<DocDB.DescribeDBInstancesCommandOutput>(command)
        return response.DBInstances ?? []
    }

    public async createCluster(input: DocDB.CreateDBClusterMessage): Promise<DocDB.DBCluster | undefined> {
        const command = new DocDB.CreateDBClusterCommand(input)
        const response = await this.executeCommand<DocDB.CreateDBClusterCommandOutput>(command)
        return response.DBCluster
    }

    public async modifyCluster(input: DocDB.ModifyDBClusterMessage): Promise<DocDB.DBCluster | undefined> {
        const command = new DocDB.ModifyDBClusterCommand(input)
        const response = await this.executeCommand<DocDB.ModifyDBClusterCommandOutput>(command)
        return response.DBCluster
    }

    public async deleteCluster(input: DocDB.DeleteDBClusterMessage): Promise<DocDB.DBCluster | undefined> {
        const command = new DocDB.DeleteDBClusterCommand(input)
        const response = await this.executeCommand<DocDB.DeleteDBClusterCommandOutput>(command)
        return response.DBCluster
    }

    public async getInstance(instanceId: string): Promise<DBInstance | undefined> {
        const input: DocDB.DescribeDBInstancesCommandInput = {
            DBInstanceIdentifier: instanceId,
        }
        const command = new DocDB.DescribeDBInstancesCommand(input)
        const response = await this.executeCommand<DocDB.DescribeDBInstancesCommandOutput>(command)
        return response.DBInstances ? response.DBInstances[0] : undefined
    }

    public async createInstance(input: DocDB.CreateDBInstanceMessage): Promise<DocDB.DBInstance | undefined> {
        const command = new DocDB.CreateDBInstanceCommand(input)
        const response = await this.executeCommand<DocDB.CreateDBInstanceCommandOutput>(command)
        return response.DBInstance
    }

    public async modifyInstance(input: DocDB.ModifyDBInstanceMessage): Promise<DocDB.DBInstance | undefined> {
        const command = new DocDB.ModifyDBInstanceCommand(input)
        const response = await this.executeCommand<DocDB.ModifyDBInstanceCommandOutput>(command)
        return response.DBInstance
    }

    public async deleteInstance(input: DocDB.DeleteDBInstanceMessage): Promise<DocDB.DBInstance | undefined> {
        const command = new DocDB.DeleteDBInstanceCommand(input)
        const response = await this.executeCommand<DocDB.DeleteDBInstanceCommandOutput>(command)
        return response.DBInstance
    }

    public async rebootInstance(instanceId: string): Promise<boolean> {
        const command = new DocDB.RebootDBInstanceCommand({ DBInstanceIdentifier: instanceId })
        const response = await this.executeCommand<DocDB.RebootDBInstanceCommandOutput>(command)
        return !!response.DBInstance
    }

    public async listResourceTags(arn: string): Promise<DocDB.Tag[]> {
        const command = new DocDB.ListTagsForResourceCommand({ ResourceName: arn })
        const response = await this.executeCommand<DocDB.ListTagsForResourceCommandOutput>(command)
        return response.TagList ?? []
    }

    public async addResourceTags(input: DocDB.AddTagsToResourceCommandInput): Promise<void> {
        const command = new DocDB.AddTagsToResourceCommand(input)
        await this.executeCommand(command)
    }

    public async removeResourceTags(input: DocDB.RemoveTagsFromResourceCommandInput): Promise<void> {
        const command = new DocDB.RemoveTagsFromResourceCommand(input)
        await this.executeCommand(command)
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

    public async createElasticCluster(
        input: DocDBElastic.CreateClusterInput
    ): Promise<DocDBElastic.Cluster | undefined> {
        getLogger().debug('CreateElasticCluster called')
        try {
            const client = await this.getElasticClient()
            const command = new DocDBElastic.CreateClusterCommand(input)
            const response = await client.send(command)
            return response.cluster
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to create DocumentDB cluster')
        }
    }
}
