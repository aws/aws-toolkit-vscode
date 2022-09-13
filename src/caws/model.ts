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
import { isCawsVSCode } from './utils'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { Commands } from '../shared/vscode/commands2'

export type DevelopmentWorkspaceId = Pick<DevelopmentWorkspace, 'id' | 'org' | 'project'>

export function getCawsSsmEnv(region: string, ssmPath: string, workspace: DevelopmentWorkspaceId): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: region,
            AWS_SSM_CLI: ssmPath,
            CAWS_ENDPOINT: getCawsConfig().endpoint,
            BEARER_TOKEN_LOCATION: bearerTokenCacheLocation(workspace.id),
            LOG_FILE_LOCATION: sshLogFileLocation(workspace.id),
            ORGANIZATION_NAME: workspace.org.name,
            PROJECT_NAME: workspace.project.name,
            WORKSPACE_ID: workspace.id,
        },
        process.env
    )
}

export function createCawsEnvProvider(
    client: ConnectedCawsClient,
    ssmPath: string,
    workspace: DevelopmentWorkspace,
    useSshAgent: boolean = true
): EnvProvider {
    return async () => {
        if (!client.connected) {
            throw new Error('Unable to provide development workpace environment variables when not logged-in')
        }

        await cacheBearerToken(client.token, workspace.id)
        const vars = getCawsSsmEnv(client.regionCode, ssmPath, workspace)

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

export function getHostNameFromEnv(env: DevelopmentWorkspaceId): string {
    return `${HOST_NAME_PREFIX}${env.id}`
}

export async function autoConnect(authProvider: CawsAuthenticationProvider) {
    const currentSession = authProvider.getActiveSession()
    if (currentSession !== undefined) {
        return currentSession
    }

    for (const account of authProvider.listAccounts().filter(({ metadata }) => metadata.canAutoConnect)) {
        getLogger().info(`REMOVED.codes: trying to auto-connect with user: ${account.label}`)

        try {
            const creds = await authProvider.createSession(account)
            getLogger().info(`REMOVED.codes: auto-connected with user: ${account.label}`)

            return creds
        } catch (err) {
            getLogger().debug(`REMOVED.codes: unable to auto-connect with user "${account.label}": %O`, err)
        }
    }

    return authProvider.tryLoginFromDisk()
}

export function createClientFactory(authProvider: CawsAuthenticationProvider): () => Promise<CawsClient> {
    return async () => {
        const client = await createClient()
        const creds = await autoConnect(authProvider)

        if (creds) {
            await client.setCredentials(creds.accessDetails, creds.accountDetails.metadata)
        }

        return client
    }
}

export interface ConnectedWorkspace {
    readonly summary: DevelopmentWorkspace
    readonly workspaceClient: DevelopmentWorkspaceClient
}

export async function getConnectedWorkspace(
    cawsClient: ConnectedCawsClient,
    workspaceClient = new DevelopmentWorkspaceClient()
): Promise<ConnectedWorkspace | undefined> {
    const arn = workspaceClient.arn
    if (!arn || !workspaceClient.isCawsWorkspace()) {
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
        throw new Error('No project or organization name found')
    }

    const summary = await cawsClient.getDevelopmentWorkspace({
        projectName,
        organizationName,
        id: workspaceId,
    })

    return { summary, workspaceClient: workspaceClient }
}

/**
 * Everything needed to connect to a development workspace via VS Code or `ssh`
 */
interface WorkspaceConnection {
    readonly sshPath: string
    readonly vscPath: string
    readonly hostname: string
    readonly envProvider: EnvProvider
    readonly SessionProcess: typeof ChildProcess
}

export async function prepareWorkpaceConnection(
    client: ConnectedCawsClient,
    { id, org, project }: DevelopmentWorkspaceId,
    { topic, timeout }: { topic?: string; timeout?: Timeout } = {}
): Promise<WorkspaceConnection> {
    const { ssm, vsc, ssh } = (await ensureDependencies()).unwrap()
    const runningWorkspace = await client.startWorkspaceWithProgress(
        {
            id,
            organizationName: org.name,
            projectName: project.name,
        },
        'RUNNING'
    )

    const hostname = getHostNameFromEnv({ id, org, project })
    const logPrefix = topic ? `REMOVED.codes ${topic} (${id})` : `REMOVED.codes (${id})`
    const logger = (data: string) => getLogger().verbose(`${logPrefix}: ${data}`)
    const envProvider = createCawsEnvProvider(client, ssm, runningWorkspace)
    const SessionProcess = createBoundProcess(envProvider).extend({
        timeout,
        onStdout: logger,
        onStderr: logger,
        rejectOnErrorCode: true,
    })

    return {
        hostname,
        envProvider,
        sshPath: ssh,
        vscPath: vsc,
        SessionProcess,
    }
}

export async function openDevelopmentWorkspace(
    client: ConnectedCawsClient,
    workspace: DevelopmentWorkspaceId,
    targetPath = '/projects'
): Promise<void> {
    const { SessionProcess, vscPath } = await prepareWorkpaceConnection(client, workspace, { topic: 'connect' })
    await startVscodeRemote(SessionProcess, getHostNameFromEnv(workspace), targetPath, vscPath)
}

// The "caws_connect" metric should really be splt into two parts:
// 1. the setup/launch from the local machine
// 2. toolkit initialization on the remote
//
// Recording metrics like this is a lot more involved so for now we'll
// assume that if the first step succeeds, the user probably succeeded
// in connecting to the workspace
export const cawsConnectCommand = Commands.register(
    {
        id: '_aws.caws.connect',
        telemetryName: 'caws_connect',
    },
    openDevelopmentWorkspace
)

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
            .listResources('developmentWorkspace')
            .flatten()
            .filter(env => env.repositories.length > 0 && isCawsVSCode(env.ides))
            .toMap(env => `${env.org.name}.${env.project.name}.${env.repositories[0].repositoryName}`)

        yield* repos.map(repo => ({
            ...repo,
            developmentWorkspace: workspaces.get(`${repo.org.name}.${repo.project.name}.${repo.name}`),
        }))
    })
}

export interface DevelopmentWorkspaceMemento {
    /** True if the extension is watching the status of the workspace to try and reconnect. */
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
