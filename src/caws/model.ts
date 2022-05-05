/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as vscode from 'vscode'
import { HOST_NAME_PREFIX } from '../mde/constants'
import { checkSession, SessionProvider } from '../mde/mdeModel'
import { CawsClient, CawsDevEnv, ConnectedCawsClient, createClient, getCawsConfig } from '../shared/clients/cawsClient'
import { RemoteEnvironmentClient } from '../shared/clients/mdeEnvironmentClient'
import { getLogger } from '../shared/logger'
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

async function autoConnect(authProvider: CawsAuthenticationProvider) {
    for (const account of authProvider.listAccounts().filter(({ metadata }) => metadata.canAutoConnect)) {
        getLogger().info(`CAWS: trying to auto-connect with user: ${account.label}`)

        try {
            const creds = await authProvider.createSession(account)
            getLogger().info(`CAWS: auto-connected with user: ${account.label}`)

            return creds
        } catch (err) {
            getLogger().debug(`CAWS: unable to auto-connect with user "${account.label}": %O`, err)
        }
    }
}

export function createClientFactory(authProvider: CawsAuthenticationProvider): () => Promise<CawsClient> {
    return async () => {
        const client = await createClient()
        const creds = authProvider.getActiveSession() ?? (await autoConnect(authProvider))

        if (creds) {
            await client.setCredentials(creds.accessDetails, creds.accountDetails.metadata)
        }

        return client
    }
}

export interface ConnectedWorkspace {
    readonly summary: CawsDevEnv
    readonly environmentClient: RemoteEnvironmentClient
}

export const CAWS_WORKSPACE_KEY = 'caws.workspaces'

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

    // XXX: we store the summary before connecting as resolving from the ARN is unstable
    const stored = globals.context.globalState.get<Record<string, CawsDevEnv>>(CAWS_WORKSPACE_KEY, {})
    const summary = stored[workspaceId]

    if (!summary) {
        throw new Error('No development workspace summary found within global state')
    }

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

interface RepoIdentifier {
    readonly name: string
    readonly project: string
    readonly org: string
}

export function toCawsGitUri(username: string, token: string, repo: RepoIdentifier): string {
    const { name, project, org } = repo

    return `https://${username}:${token}@${getCawsConfig().gitHostname}/v1/${org}/${project}/${name}`
}
