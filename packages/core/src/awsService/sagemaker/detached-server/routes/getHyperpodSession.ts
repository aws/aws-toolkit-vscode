/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { readHyperpodMapping, HyperpodSpaceMapping } from '../hyperpodMappingUtils'
import { KubectlClient } from '../kubectlClientStub'
import { HyperpodCluster, HyperpodDevSpace, EksClusterInfo } from '../hyperpodTypes'
import { HttpError } from '@kubernetes/client-node'

const maxRetries = 8
const attemptCount = new Map<string, number>()
const lastAttemptTime = new Map<string, number>()
const resetWindowMs = 10 * 60 * 1000

export async function handleGetHyperpodSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const connectionKey = parsedUrl.query.connection_key as string

    if (!connectionKey) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Missing required query parameter: "connection_key"')
        return
    }

    // Rate limiting
    const now = Date.now()
    if (now - (lastAttemptTime.get(connectionKey) ?? 0) > resetWindowMs) {
        attemptCount.set(connectionKey, 0)
    }
    lastAttemptTime.set(connectionKey, now)
    const count = (attemptCount.get(connectionKey) ?? 0) + 1
    attemptCount.set(connectionKey, count)

    if (count > maxRetries) {
        console.debug(`Retry cap reached for HyperPod connection ${connectionKey} (${count}/${maxRetries})`)
        res.writeHead(429, { 'Content-Type': 'text/plain' })
        res.end('Too many retry attempts. Please reconnect manually from the IDE.')
        return
    }

    let mapping: HyperpodSpaceMapping
    try {
        const allMappings = await readHyperpodMapping()
        const entry = allMappings[connectionKey]
        if (!entry) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end(`No HyperPod connection found for key: "${connectionKey}"`)
            return
        }
        mapping = entry
    } catch (err) {
        console.error('Failed to read HyperPod mapping:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(`Failed to read HyperPod connection mapping: ${(err as Error).message}`)
        return
    }

    if (!mapping.credentials) {
        res.writeHead(401, { 'Content-Type': 'text/plain' })
        res.end('No stored credentials for this HyperPod connection. Please reconnect from the IDE.')
        return
    }

    if (!mapping.endpoint || !mapping.eksClusterName) {
        res.writeHead(422, { 'Content-Type': 'text/plain' })
        res.end('Missing EKS cluster metadata for this HyperPod connection. Please reconnect from the IDE.')
        return
    }

    const eksCluster: EksClusterInfo = {
        name: mapping.eksClusterName,
        endpoint: mapping.endpoint,
        certificateAuthority: mapping.certificateAuthorityData ? { data: mapping.certificateAuthorityData } : undefined,
    }

    const hyperpodCluster: HyperpodCluster = {
        clusterName: mapping.clusterName,
        clusterArn: mapping.clusterArn,
        status: 'InService',
        regionCode: mapping.region ?? '',
    }

    // Parse connection key to extract workspace name: "workspace:namespace:cluster"
    const [workspaceName] = connectionKey.split(':')

    const devSpace: HyperpodDevSpace = {
        name: workspaceName,
        namespace: mapping.namespace,
        cluster: mapping.clusterName,
        group: 'workspace.jupyter.org',
        version: 'v1alpha1',
        plural: 'workspaces',
        status: '',
        appType: '',
        creator: '',
        accessType: '',
    }

    try {
        const kubectlClient = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, mapping.credentials)
        const connection = await kubectlClient.createWorkspaceConnection(devSpace)

        attemptCount.delete(connectionKey)
        lastAttemptTime.delete(connectionKey)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
            JSON.stringify({
                SessionId: connection.sessionId,
                StreamUrl: connection.url,
                TokenValue: connection.token,
            })
        )
    } catch (err) {
        console.error(`Failed to create HyperPod workspace connection for ${connectionKey}:`, err)
        // Surface K8s API status codes (e.g. 401, 403) when available.
        // HttpError is thrown directly by createForCluster (token generation).
        // createWorkspaceConnection wraps errors in a plain Error, so we also check .cause.
        const httpErr =
            err instanceof HttpError ? err : (err as any)?.cause instanceof HttpError ? (err as any).cause : undefined
        const statusCode = httpErr?.statusCode ?? 500
        res.writeHead(statusCode, { 'Content-Type': 'text/plain' })
        res.end(`Failed to create workspace connection: ${(err as Error).message}`)
    }
}
