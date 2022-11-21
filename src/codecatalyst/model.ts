/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as vscode from 'vscode'
import * as path from 'path'
import {
    CodeCatalystClient,
    DevEnvironment,
    CodeCatalystRepo,
    ConnectedCodeCatalystClient,
    createClient,
    getCodeCatalystConfig,
} from '../shared/clients/codecatalystClient'
import { DevEnvClient } from '../shared/clients/devenvClient'
import { getLogger } from '../shared/logger'
import { CodeCatalystAuthenticationProvider } from './auth'
import { AsyncCollection, toCollection } from '../shared/utilities/asyncCollection'
import { getCodeCatalystSpaceName, getCodeCatalystProjectName } from '../shared/vscode/env'
import { writeFile } from 'fs-extra'
import { SSH_AGENT_SOCKET_VARIABLE, startSshAgent, startVscodeRemote } from '../shared/extensions/ssh'
import { ChildProcess } from '../shared/utilities/childProcess'
import { ensureDependencies, HOST_NAME_PREFIX } from './tools'
import { isCodeCatalystVSCode } from './utils'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { Commands } from '../shared/vscode/commands2'
import * as codecatalyst from '../../types/clientcodecatalyst'

export type DevEnvironmentId = Pick<DevEnvironment, 'id' | 'org' | 'project'>

export function getCodeCatalystSsmEnv(region: string, ssmPath: string, devenv: DevEnvironmentId): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: region,
            AWS_SSM_CLI: ssmPath,
            CODECATALYST_ENDPOINT: getCodeCatalystConfig().endpoint,
            BEARER_TOKEN_LOCATION: bearerTokenCacheLocation(devenv.id),
            LOG_FILE_LOCATION: sshLogFileLocation(devenv.id),
            SPACE_NAME: devenv.org.name,
            PROJECT_NAME: devenv.project.name,
            DEVENV_ID: devenv.id,
        },
        process.env
    )
}

export function createCodeCatalystEnvProvider(
    client: ConnectedCodeCatalystClient,
    ssmPath: string,
    devenv: DevEnvironment,
    useSshAgent: boolean = true
): EnvProvider {
    return async () => {
        if (!client.connected) {
            throw new Error('Cannot provide environment variables when not logged-in')
        }

        await cacheBearerToken(client.token, devenv.id)
        const vars = getCodeCatalystSsmEnv(client.regionCode, ssmPath, devenv)

        return useSshAgent ? { [SSH_AGENT_SOCKET_VARIABLE]: await startSshAgent(), ...vars } : vars
    }
}

type EnvProvider = () => Promise<NodeJS.ProcessEnv>

/**
 * Creates a new {@link ChildProcess} class bound to a specific development environment. All instances of this
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

export async function cacheBearerToken(bearerToken: string, devenvId: string): Promise<void> {
    await writeFile(bearerTokenCacheLocation(devenvId), `${bearerToken}`, 'utf8')
}

export function bearerTokenCacheLocation(devenvId: string): string {
    return path.join(globals.context.globalStorageUri.fsPath, `codecatalyst.${devenvId}.token`)
}

export function sshLogFileLocation(devenvId: string): string {
    return path.join(globals.context.globalStorageUri.fsPath, `codecatalyst.${devenvId}.log`)
}

export function getHostNameFromEnv(env: DevEnvironmentId): string {
    return `${HOST_NAME_PREFIX}${env.id}`
}

export function createClientFactory(
    authProvider: CodeCatalystAuthenticationProvider
): () => Promise<CodeCatalystClient> {
    return async () => {
        await authProvider.restore()
        const client = await createClient()
        const conn = authProvider.activeConnection

        if (conn) {
            // TODO(sijaden): add global caching module
            return client.setCredentials(async () => (await conn.getToken()).accessToken)
        } else {
            // TODO: show prompt/notification to use Builder ID
        }

        return client
    }
}

export interface ConnectedDevEnv {
    readonly summary: DevEnvironment
    readonly devenvClient: DevEnvClient
}

export async function getConnectedDevEnv(
    codeCatalystClient: ConnectedCodeCatalystClient,
    devenvClient = new DevEnvClient()
): Promise<ConnectedDevEnv | undefined> {
    const devEnvId = devenvClient.id
    if (!devEnvId || !devenvClient.isCodeCatalystDevEnv()) {
        return
    }

    const projectName = getCodeCatalystProjectName()
    const spaceName = getCodeCatalystSpaceName()

    if (!projectName || !spaceName) {
        throw new Error('No project or space name found')
    }

    const summary = await codeCatalystClient.getDevEnvironment({
        projectName: projectName,
        spaceName: spaceName,
        id: devEnvId,
    })

    return { summary, devenvClient: devenvClient }
}

/**
 * Everything needed to connect to a development environment via VS Code or `ssh`
 */
interface DevEnvConnection {
    readonly sshPath: string
    readonly vscPath: string
    readonly hostname: string
    readonly envProvider: EnvProvider
    readonly SessionProcess: typeof ChildProcess
}

export async function prepareDevEnvConnection(
    client: ConnectedCodeCatalystClient,
    { id, org, project }: DevEnvironmentId,
    { topic, timeout }: { topic?: string; timeout?: Timeout } = {}
): Promise<DevEnvConnection> {
    const { ssm, vsc, ssh } = (await ensureDependencies()).unwrap()
    const runningDevEnv = await client.startDevEnvironmentWithProgress(
        {
            id,
            spaceName: org.name,
            projectName: project.name,
        },
        'RUNNING'
    )

    const hostname = getHostNameFromEnv({ id, org, project })
    const logPrefix = topic ? `codecatalyst ${topic} (${id})` : `codecatalyst (${id})`
    const logger = (data: string) => getLogger().verbose(`${logPrefix}: ${data}`)
    const envProvider = createCodeCatalystEnvProvider(client, ssm, runningDevEnv)
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

/**
 * Starts the given devenv, waits, and connects a new vscode instance when the devenv is ready.
 *
 * @param client CodeCatalyst service client
 * @param devenv DevEnvironment to open
 * @param targetPath vscode workspace (default: "/projects/[repo]")
 */
export async function openDevEnv(
    client: ConnectedCodeCatalystClient,
    devenv: DevEnvironmentId,
    targetPath?: string
): Promise<void> {
    const { SessionProcess, vscPath } = await prepareDevEnvConnection(client, devenv, { topic: 'connect' })
    if (!targetPath) {
        const env = await client.getDevEnvironment({
            spaceName: devenv.org.name,
            projectName: devenv.project.name,
            id: devenv.id,
        })
        const repo = env.repositories.length == 1 ? env.repositories[0].repositoryName : undefined
        targetPath = repo ? `/projects/${repo}` : '/projects'
    }
    await startVscodeRemote(SessionProcess, getHostNameFromEnv(devenv), targetPath, vscPath)
}

// The "codecatalyst_connect" metric should really be splt into two parts:
// 1. the setup/launch from the local machine
// 2. toolkit initialization on the remote
//
// Recording metrics like this is a lot more involved so for now we'll
// assume that if the first step succeeds, the user probably succeeded
// in connecting to the devenv
export const codeCatalystConnectCommand = Commands.register(
    {
        id: '_aws.codecatalyst.connect',
        telemetryName: 'codecatalyst_connect',
    },
    openDevEnv
)

export async function getDevfileLocation(client: DevEnvClient, root?: vscode.Uri) {
    const rootDirectory = root ?? vscode.workspace.workspaceFolders?.[0].uri
    if (!rootDirectory) {
        throw new Error('No root directory or Dev Environment folder found')
    }

    // TODO(sijaden): should make this load greedily and continously poll
    // latency is very high for some reason
    const devfileLocation = await client.getStatus().then(r => r.location)
    if (!devfileLocation) {
        throw new Error('Devfile location was not found')
    }

    return vscode.Uri.joinPath(rootDirectory, devfileLocation)
}

function toCodeCatalystGitUri(username: string, token: string, cloneUrl: string): string {
    // "https://user@git.gamma.…" => "git.gamma.…"
    let url = cloneUrl.replace(/https:\/\/[^@\/]+@/, '')
    if (url === cloneUrl) {
        // URL didn't change, so it's missing the "user@" part.
        // "https://git.gamma.…" => "git.gamma.…"
        url = cloneUrl.replace('https://', '')
    }
    return `https://${username}:${token}@${url}`
}

/**
 * Gets a URL including username and password (PAT) that can be used by git to clone the given CodeCatalyst repo.
 *
 * Example: "https://user:pass@git.gamma.…"
 *
 * @param args
 * @returns Clone URL (example: "https://user:pass@git.gamma.…")
 */
export async function getRepoCloneUrl(
    client: ConnectedCodeCatalystClient,
    args: codecatalyst.GetSourceRepositoryCloneUrlsRequest,
    user: string,
    password: string
): Promise<string> {
    const url = await client.getRepoCloneUrl(args)
    const cloneurl = toCodeCatalystGitUri(user, password, url)
    return cloneurl
}

/**
 * Given a collection of CodeCatalyst repos, try to find a corresponding devenv, if any
 */
export function associateDevEnv(
    client: ConnectedCodeCatalystClient,
    repos: AsyncCollection<CodeCatalystRepo>
): AsyncCollection<CodeCatalystRepo & { devEnv?: DevEnvironment }> {
    return toCollection(async function* () {
        const devenvs = await client
            .listResources('devEnvironment')
            .flatten()
            .filter(env => env.repositories.length > 0 && isCodeCatalystVSCode(env.ides))
            .toMap(env => `${env.org.name}.${env.project.name}.${env.repositories[0].repositoryName}`)

        yield* repos.map(repo => ({
            ...repo,
            devEnv: devenvs.get(`${repo.org.name}.${repo.project.name}.${repo.name}`),
        }))
    })
}

export interface DevEnvMemento {
    /** True if the extension is watching the status of the devenv to try and reconnect. */
    attemptingReconnect?: boolean
    /** Unix time of the most recent connection. */
    previousConnectionTimestamp: number
    /** Previous open vscode workspace directory. */
    previousVscodeWorkspace: string
    /** CodeCatalyst Space (Org) Name */
    spaceName: string
    /** CodeCatalyst Project name */
    projectName: string
    /** CodeCatalyst Alias */
    alias: string | undefined
}

export const CODECATALYST_RECONNECT_KEY = 'CODECATALYST_RECONNECT'
