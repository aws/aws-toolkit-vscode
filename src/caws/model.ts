/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as vscode from 'vscode'
import * as path from 'path'
import {
    CawsClient,
    DevelopmentWorkspace,
    CawsRepo,
    ConnectedCawsClient,
    createClient,
    getCawsConfig,
} from '../shared/clients/cawsClient'
import { DevelopmentWorkspaceClient } from '../shared/clients/developmentWorkspaceClient'
import { getLogger } from '../shared/logger'
import { CawsAuthenticationProvider } from './auth'
import { AsyncCollection, toCollection } from '../shared/utilities/asyncCollection'
import { getCawsOrganizationName, getCawsProjectName } from '../shared/vscode/env'
import { writeFile } from 'fs-extra'
import { SSH_AGENT_SOCKET_VARIABLE, startSshAgent, startVscodeRemote } from '../shared/extensions/ssh'
import { ChildProcess } from '../shared/utilities/childProcess'
import { ensureDependencies, HOST_NAME_PREFIX } from './tools'

export type DevEnvId = Pick<DevelopmentWorkspace, 'id' | 'org' | 'project'>

export function getCawsSsmEnv(region: string, ssmPath: string, envs: DevEnvId): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: region,
            AWS_SSM_CLI: ssmPath,
            CAWS_ENDPOINT: getCawsConfig().endpoint,
            BEARER_TOKEN_LOCATION: bearerTokenCacheLocation(envs.id),
            LOG_FILE_LOCATION: sshLogFileLocation(envs.id),
            ORGANIZATION_NAME: envs.org.name,
            PROJECT_NAME: envs.project.name,
            WORKSPACE_ID: envs.id,
        },
        process.env
    )
}

export function createCawsEnvProvider(
    client: ConnectedCawsClient,
    ssmPath: string,
    env: DevelopmentWorkspace,
    useSshAgent: boolean = true
): EnvProvider {
    return async () => {
        if (!client.connected) {
            throw new Error('Unable to provide CAWS environment variables for disconnected environment')
        }

        await cacheBearerToken(client.token, env.id)
        const vars = getCawsSsmEnv(client.regionCode, ssmPath, env)

        return useSshAgent ? { [SSH_AGENT_SOCKET_VARIABLE]: await startSshAgent(), ...vars } : vars
    }
}

type EnvProvider = () => Promise<NodeJS.ProcessEnv>

/**
 * Creates a new {@link ChildProcess} class bound to a specific CAWS workspace. All instances of this
 * derived class will have SSM session information injected as environment variables as-needed.
 */
export function createBoundProcess(envProvider: EnvProvider): typeof ChildProcess {
    type Run = ChildProcess['run']
    return class SessionBoundProcess extends ChildProcess {
        public override async run(...args: Parameters<Run>): ReturnType<Run> {
            const options = args[0]
            const envVars = await envProvider()
            const spawnOptions = {
                ...options?.spawnOptions,
                env: { ...envVars, ...options?.spawnOptions?.env },
            }

            return super.run({ ...options, spawnOptions })
        }
    }
}

export async function cacheBearerToken(bearerToken: string, workspaceId: string): Promise<void> {
    await writeFile(bearerTokenCacheLocation(workspaceId), `${bearerToken}`, 'utf8')
}

export function bearerTokenCacheLocation(workspaceId: string): string {
    return path.join(globals.context.globalStorageUri.fsPath, `caws.${workspaceId}.token`)
}

export function sshLogFileLocation(workspaceId: string): string {
    return path.join(globals.context.globalStorageUri.fsPath, `caws.${workspaceId}.log`)
}

export function getHostNameFromEnv(env: DevEnvId): string {
    return `${HOST_NAME_PREFIX}${env.id}`
}

export async function autoConnect(authProvider: CawsAuthenticationProvider) {
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
    readonly summary: DevelopmentWorkspace
    readonly environmentClient: DevelopmentWorkspaceClient
}

export async function getConnectedWorkspace(
    cawsClient: ConnectedCawsClient,
    environmentClient = new DevelopmentWorkspaceClient()
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

    const summary = await cawsClient.getDevelopmentWorkspace({
        projectName,
        organizationName,
        id: workspaceId,
    })

    return { summary, environmentClient }
}

export async function openDevEnv(
    client: ConnectedCawsClient,
    env: DevelopmentWorkspace,
    targetWorkspace = '/projects'
): Promise<void> {
    const runningEnv = await client.startEnvironmentWithProgress(
        {
            id: env.id,
            organizationName: env.org.name,
            projectName: env.project.name,
        },
        'RUNNING'
    )
    if (!runningEnv) {
        getLogger().error('openDevEnv: failed to start environment: %s', env.id)
        return
    }

    const deps = (await ensureDependencies()).unwrap()

    const cawsEnvProvider = createCawsEnvProvider(client, deps.ssm, env)
    const SessionProcess = createBoundProcess(cawsEnvProvider).extend({
        onStdout(stdout) {
            getLogger().verbose(`CAWS connect: ${env.id}: ${stdout}`)
        },
        onStderr(stderr) {
            getLogger().verbose(`CAWS connect: ${env.id}: ${stderr}`)
        },
        rejectOnErrorCode: true,
    })

    await startVscodeRemote(SessionProcess, getHostNameFromEnv(env), targetWorkspace, deps.vsc)
}

// Should technically be with the MDE stuff
export async function getDevfileLocation(client: DevelopmentWorkspaceClient, root?: vscode.Uri) {
    const rootDirectory = root ?? vscode.workspace.workspaceFolders?.[0].uri
    if (!rootDirectory) {
        throw new Error('No root directory or workspace folder found')
    }

    // TODO(sijaden): should make this load greedily and continously poll
    // latency is very high for some reason
    const devfileLocation = await client.getStatus().then(r => r.location)
    if (!devfileLocation) {
        throw new Error('Devfile location was not found')
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
): AsyncCollection<CawsRepo & { developmentWorkspace?: DevelopmentWorkspace }> {
    return toCollection(async function* () {
        const workspaces = await client
            .listResources('env')
            .flatten()
            .filter(env => env.repositories.length > 0 && env.ide === 'VSCode')
            .toMap(env => `${env.org.name}.${env.project.name}.${env.repositories[0].repositoryName}`)

        yield* repos.map(repo => ({
            ...repo,
            developmentWorkspace: workspaces.get(`${repo.org.name}.${repo.project.name}.${repo.name}`),
        }))
    })
}

export interface EnvironmentMemento {
    /** True if the environment is watching the status of the workspace to try and reconnect. */
    attemptingReconnect?: boolean
    /** Unix time of the most recent connection. */
    previousConnectionTimestamp: number
    /** Previous open workspace */
    previousOpenWorkspace: string
    /** CAWS Organization Name */
    organizationName: string
    /** CAWS Project name */
    projectName: string
    /** CAWS Alias */
    alias: string | undefined
}

export const CAWS_RECONNECT_KEY = 'CAWS_RECONNECT'
