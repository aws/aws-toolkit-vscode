/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { getHyperpodConnection } from '../hyperpodMappingUtils'
import { KubectlClient, HyperpodDevSpace, HyperpodCluster } from '../kubectlClientStub'

export async function handleGetHyperpodSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const devspaceName = parsedUrl.query.devspace_name

    try {
        if (!devspaceName) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'error', message: 'devspace_name required' }))
            return
        }

        // Get stored connection info
        const connectionInfo = await getHyperpodConnection(devspaceName as string)
        if (!connectionInfo) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'error', message: 'Connection info not found' }))
            return
        }

        // Use stored EKS cluster info to avoid AWS SDK dependency
        const region = extractRegionFromArn(connectionInfo.clusterArn)
        const hyperpodCluster: HyperpodCluster = {
            clusterName: connectionInfo.clusterName,
            clusterArn: connectionInfo.clusterArn,
            status: 'Active',
            regionCode: region,
        }

        // Create minimal EKS cluster object from stored data
        const eksCluster = {
            name: connectionInfo.eksClusterName,
            arn: connectionInfo.clusterArn,
            endpoint: connectionInfo.endpoint,
            certificateAuthority: {
                data: connectionInfo.certificateAuthorityData,
            },
        }

        const kubectlClient = new KubectlClient(eksCluster, hyperpodCluster)

        const devSpace: HyperpodDevSpace = {
            name: devspaceName as string,
            namespace: connectionInfo.namespace,
            cluster: connectionInfo.clusterName,
            group: 'workspace.jupyter.org',
            version: 'v1alpha1',
            plural: 'workspaces',
            status: 'Running',
            appType: '',
            creator: '',
            accessType: '',
        }

        // Always get fresh presigned URL and connection details
        const workspaceConnection = await kubectlClient.createWorkspaceConnection(devSpace)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
            JSON.stringify({
                status: 'success',
                connection: workspaceConnection,
                devspace: devspaceName,
                timestamp: Date.now(),
            })
        )
    } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'error', message: error.message }))
    }
}

function extractRegionFromArn(arn: string): string {
    const parts = arn.split(':')
    if (parts.length >= 4) {
        return parts[3]
    }
    throw new Error(`Invalid ARN format: ${arn}`)
}
