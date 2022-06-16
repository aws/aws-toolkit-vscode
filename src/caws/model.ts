/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { HOST_NAME_PREFIX } from '../mde/constants'
import { EnvProvider, SSH_AGENT_SOCKET_VARIABLE, startSshAgent } from '../mde/mdeModel'
import {
    CawsClient,
    CawsDevEnv,
    CawsRepo,
    ConnectedCawsClient,
    createClient,
    getCawsConfig,
} from '../shared/clients/cawsClient'
import { RemoteEnvironmentClient } from '../shared/clients/mdeEnvironmentClient'
import { getLogger } from '../shared/logger'
import { CawsAuthenticationProvider } from './auth'
import { AsyncCollection, toCollection } from '../shared/utilities/asyncCollection'
import { getCawsOrganizationName, getCawsProjectName } from '../shared/vscode/env'
import { writeFile } from 'fs-extra'
import globals from '../shared/extensionGlobals'

export type DevEnvId = Pick<CawsDevEnv, 'org' | 'project' | 'developmentWorkspaceId'>

export function getCawsSsmEnv(region: string, ssmPath: string, envs: CawsDevEnv): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: region,
            AWS_SSM_CLI: ssmPath,
            CAWS_ENDPOINT: getCawsConfig().endpoint,
            BEARER_TOKEN_LOCATION: bearerTokenCacheLocation(envs.developmentWorkspaceId),
            ORGANIZATION_NAME: envs.org.name,
            PROJECT_NAME: envs.project.name,
            WORKSPACE_ID: envs.developmentWorkspaceId,
        },
        process.env
    )
}

export function createCawsEnvProvider(
    client: ConnectedCawsClient,
    ssmPath: string,
    env: CawsDevEnv,
    useSshAgent: boolean = true
): EnvProvider {
    return async () => {
        if (!client.connected) {
            throw new Error('Unable to provide CAWS environment variables for disconnected environment')
        }

        await cacheBearerToken(client.token, env.developmentWorkspaceId)
        const vars = getCawsSsmEnv(client.regionCode, ssmPath, env)

        return useSshAgent ? { [SSH_AGENT_SOCKET_VARIABLE]: await startSshAgent(), ...vars } : vars
    }
}

export async function cacheBearerToken(bearerToken: string, workspaceId: string): Promise<void> {
    await writeFile(bearerTokenCacheLocation(workspaceId), `${bearerToken}`, 'utf8')
}

export function bearerTokenCacheLocation(workspaceId: string): string {
    return path.join(globals.context.globalStorageUri.fsPath, `${workspaceId}.txt`)
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

export async function getConnectedWorkspace(
    cawsClient: ConnectedCawsClient,
    environmentClient = new RemoteEnvironmentClient()
): Promise<ConnectedWorkspace | undefined> {
    const arn = environmentClient.arn
    if (!arn || !environmentClient.isCawsWorkspace()) {
        return
    }

    // ARN path segment follows this pattern: /organization/<GUID>/project/<GUID>/development-workspace/<GUID>
    const path = arn.split(':').pop()
    if (!path) {
        throw new Error(`Workspace ARN "${arn}" did not contain a path segment`)
    }

    const projectName = getCawsProjectName()
    const organizationName = getCawsOrganizationName()
    const workspaceId = path.match(/development-workspace\/([\w\-]+)/)?.[1]

    if (!workspaceId) {
        throw new Error('Unable to parse workspace id from ARN')
    }

    if (!projectName || !organizationName) {
        throw new Error('No project or organization name found.')
    }

    const summary = await cawsClient.getDevEnv({
        projectName,
        organizationName,
        developmentWorkspaceId: workspaceId,
    })

    return { summary, environmentClient }
}

// Should technically be with the MDE stuff
export async function getDevfileLocation(client: RemoteEnvironmentClient, root?: vscode.Uri) {
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

/**
 * Given a collection of CAWS repos, try to find a corresponding workspace, if any
 */
export function associateWorkspace(
    client: ConnectedCawsClient,
    repos: AsyncCollection<CawsRepo>
): AsyncCollection<CawsRepo & { developmentWorkspace?: CawsDevEnv }> {
    return toCollection(async function* () {
        const workspaces = await client
            .listResources('env')
            .flatten()
            .filter(env => env.repositories.length > 0)
            .toMap(env => `${env.org.name}.${env.project.name}.${env.repositories[0].repositoryName}`)

        yield* repos.map(repo => ({
            ...repo,
            developmentWorkspace: workspaces.get(`${repo.org.name}.${repo.project.name}.${repo.name}`),
        }))
    })
}
