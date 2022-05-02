/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { HOST_NAME_PREFIX } from '../mde/constants'
import { checkSession, SessionProvider } from '../mde/mdeModel'
import { CawsClient, CawsDevEnv, ConnectedCawsClient, createClient } from '../shared/clients/cawsClient'
import { RemoteEnvironmentClient } from '../shared/clients/mdeEnvironmentClient'
import { CawsAuthenticationProvider } from './auth'

export type DevEnvId = Pick<CawsDevEnv, 'org' | 'project' | 'developmentWorkspaceId'>
export function createCawsSessionProvider(
    client: ConnectedCawsClient,
    ssmPath: string,
    sshPath = 'ssh'
): SessionProvider<DevEnvId> {
    return {
        isActive: env => checkSession(getHostNameFromEnv(env), sshPath),
        getDetails: async env => {
            const session = await client.startDevEnvSession({
                projectName: env.project.name,
                organizationName: env.org.name,
                developmentWorkspaceId: env.developmentWorkspaceId,
                sessionConfiguration: { sessionType: 'SSH' },
            })

            return {
                ssmPath,
                region: client.regionCode,
                host: getHostNameFromEnv(env),
                id: session.sessionId,
                ...session,
            }
        },
    }
}

export function getHostNameFromEnv(env: DevEnvId): string {
    return `${HOST_NAME_PREFIX}${env.developmentWorkspaceId}`
}

export function createClientFactory(authProvider: CawsAuthenticationProvider): () => Promise<CawsClient> {
    return async () => {
        const creds = authProvider.getActiveSession()
        const client = await createClient()

        if (creds) {
            await client.setCredentials(creds.accessDetails, creds.accountDetails.id)
        }

        return client
    }
}

export interface ConnectedWorkspace {
    readonly summary: CawsDevEnv
    readonly environmentClient: RemoteEnvironmentClient
}

export async function getConnectedWorkspace(
    cawsClient: ConnectedCawsClient,
    environmentClient = new RemoteEnvironmentClient()
): Promise<ConnectedWorkspace | undefined> {
    const arn = environmentClient.arn
    if (!arn || !environmentClient.isCawsWorkspace()) {
        return
    }

    // ARN path segment follows this pattern: /organization/<GUID>/project/<GUID>/development-workspace/<GUID>
    // Pretty unwieldy. I'd expect that CAWS introduces a way to get a resource from a single GUID soon.
    const path = arn.split(':').pop()
    if (!path) {
        throw new Error(`Workspace ARN "${arn}" did not contain a path segment`)
    }

    const [_0, _1, orgId, _2, projectId, _3, workspaceId] = path.split('/')
    if (!orgId || !projectId || !workspaceId) {
        throw new Error(`Workspace ARN path "${path}" is missing an org, project, or workspace ID`)
    }

    // The following API calls add a good amount of delay. Perhaps `memoize` successful executions.
    // TODO(sijaden): implement a 'find' method that terminates early. It's useful for other things...
    const matchedOrgs = await cawsClient
        .listOrgs()
        .flatten()
        .filter(o => o.id === orgId)
        .promise()

    const organizationName = matchedOrgs[0]?.name
    if (!organizationName) {
        throw new Error(`No organization name found for ID: ${orgId}`)
    }

    const matchedProjects = await cawsClient
        .listProjects({ organizationName })
        .flatten()
        .filter(o => o.id === projectId)
        .promise()

    const projectName = matchedProjects[0]?.name
    if (!projectName) {
        throw new Error(`No project name found for ID: ${projectId}`)
    }

    const summary = await cawsClient.getDevEnv({
        projectName,
        organizationName,
        developmentWorkspaceId: workspaceId,
    })

    return { summary, environmentClient }
}

// Should technically be with the MDE stuff
export async function getDevFileLocation(client: RemoteEnvironmentClient, root?: vscode.Uri) {
    const rootDirectory = root ?? vscode.workspace.workspaceFolders?.[0].uri
    if (!rootDirectory) {
        throw new Error('No root directory or workspace folder found')
    }

    // TODO(sijaden): should make this load greedily and continously poll
    // latency is very high for some reason
    const devfileLocation = await client.getStatus().then(r => r.location)
    if (!devfileLocation) {
        throw new Error('DevFile location was not found')
    }

    return vscode.Uri.joinPath(rootDirectory, devfileLocation)
}
