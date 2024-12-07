/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as vscode from 'vscode'
import * as path from 'path'
import {
    createClient,
    CodeCatalystClient,
    DevEnvironment,
    CodeCatalystRepo,
    getCodeCatalystConfig,
} from '../shared/clients/codecatalystClient'
import { DevEnvClient } from '../shared/clients/devenvClient'
import { getLogger } from '../shared/logger'
import { AsyncCollection, toCollection } from '../shared/utilities/asyncCollection'
import { getCodeCatalystSpaceName, getCodeCatalystProjectName, getCodeCatalystDevEnvId } from '../shared/vscode/env'
import { sshAgentSocketVariable, startSshAgent, startVscodeRemote } from '../shared/extensions/ssh'
import { isDevenvVscode } from './utils'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { Commands } from '../shared/vscode/commands2'
import { areEqual } from '../shared/utilities/pathUtils'
import { fileExists } from '../shared/filesystemUtilities'
import { CodeCatalystAuthenticationProvider } from './auth'
import { ToolkitError } from '../shared/errors'
import { Result } from '../shared/utilities/result'
import { EnvProvider, VscodeRemoteConnection, createBoundProcess, ensureDependencies } from '../shared/remoteSession'
import { SshConfig, sshLogFileLocation } from '../shared/sshConfig'
import { fs } from '../shared'

export type DevEnvironmentId = Pick<DevEnvironment, 'id' | 'org' | 'project'>
export const connectScriptPrefix = 'codecatalyst_connect'

export const docs = {
    vscode: {
        main: vscode.Uri.parse('https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codecatalyst-service'),
        overview: vscode.Uri.parse(
            'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codecatalyst-overview.html'
        ),
        devenv: vscode.Uri.parse(
            'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codecatalyst-devenvironment.html'
        ),
        setup: vscode.Uri.parse(
            'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codecatalyst-setup.html'
        ),
        troubleshoot: vscode.Uri.parse(
            'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codecatalyst-troubleshoot.html'
        ),
    },
    cloud9: {
        // Working with Amazon CodeCatalyst
        main: vscode.Uri.parse('https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-cloud9'),
        // Getting Started
        overview: vscode.Uri.parse(
            'https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-cloud9-getstarted'
        ),
        // Opening Dev Environment settings in AWS Cloud9
        settings: vscode.Uri.parse('https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-settings-cloud9'),
        // Resuming a Dev Environment in AWS Cloud9
        devenv: vscode.Uri.parse('https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-resume-cloud9'),
        // Creating a Dev Environment in AWS Cloud9
        devenvCreate: vscode.Uri.parse(
            'https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-create-cloud9'
        ),
        // Stopping a Dev Environment in AWS Cloud9
        devenvStop: vscode.Uri.parse('https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-stop-cloud9'),
        // Deleting a Dev Environment in AWS Cloud9
        devenvDelete: vscode.Uri.parse(
            'https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-delete-cloud9'
        ),
        // Editing the repo devfile for a Dev Environment in AWS Cloud9
        devfileEdit: vscode.Uri.parse(
            'https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-edit-devfile-cloud9'
        ),
        // Cloning a repository in AWS Cloud9
        cloneRepo: vscode.Uri.parse('https://docs.aws.amazon.com/cloud9/latest/user-guide/ide-toolkits-clone-cloud9'),
    },
} as const

export function getCodeCatalystSsmEnv(region: string, ssmPath: string, devenv: DevEnvironmentId): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: region,
            AWS_SSM_CLI: ssmPath,
            CODECATALYST_ENDPOINT: getCodeCatalystConfig().endpoint,
            BEARER_TOKEN_LOCATION: bearerTokenCacheLocation(devenv.id),
            LOG_FILE_LOCATION: sshLogFileLocation('codecatalyst', devenv.id),
            SPACE_NAME: devenv.org.name,
            PROJECT_NAME: devenv.project.name,
            DEVENV_ID: devenv.id,
        },
        process.env
    )
}

export function createCodeCatalystEnvProvider(
    client: CodeCatalystClient,
    ssmPath: string,
    devenv: DevEnvironment,
    useSshAgent: boolean = true
): EnvProvider {
    return async () => {
        await cacheBearerToken(await client.getBearerToken(), devenv.id)
        const vars = getCodeCatalystSsmEnv(client.regionCode, ssmPath, devenv)

        return useSshAgent ? { [sshAgentSocketVariable]: await startSshAgent(), ...vars } : vars
    }
}

export async function cacheBearerToken(bearerToken: string, devenvId: string): Promise<void> {
    await fs.writeFile(bearerTokenCacheLocation(devenvId), `${bearerToken}`, 'utf8')
}

export function bearerTokenCacheLocation(devenvId: string): string {
    return path.join(globals.context.globalStorageUri.fsPath, `codecatalyst.${devenvId}.token`)
}

export interface ConnectedDevEnv {
    readonly summary: DevEnvironment
    readonly devenvClient: DevEnvClient
}

export async function getConnectedDevEnv(
    codeCatalystClient: CodeCatalystClient,
    devenvClient = DevEnvClient.instance
): Promise<ConnectedDevEnv> {
    const devEnvId = devenvClient.id
    if (!devEnvId) {
        throw new ToolkitError('Not connected to a dev environment', { code: 'NotConnectedToDevEnv' })
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
 * Gets the current devenv that Toolkit is running in, if any.
 */
export async function getThisDevEnv(authProvider: CodeCatalystAuthenticationProvider) {
    if (!getCodeCatalystDevEnvId()) {
        return
    }

    try {
        await authProvider.restore()
        const conn = authProvider.activeConnection
        if (conn !== undefined && authProvider.auth.getConnectionState(conn) === 'valid') {
            const client = await createClient(conn)
            return Result.ok(await getConnectedDevEnv(client))
        }
    } catch (err) {
        return Result.err(err)
    }
}

/**
 * Everything needed to connect to a dev environment via VS Code or `ssh`
 */
interface DevEnvConnection extends VscodeRemoteConnection {
    readonly devenv: DevEnvironment
}

export async function prepareDevEnvConnection(
    client: CodeCatalystClient,
    { id, org, project }: DevEnvironmentId,
    { topic, timeout }: { topic?: string; timeout?: Timeout } = {}
): Promise<DevEnvConnection> {
    const { ssm, vsc, ssh } = (await ensureDependencies()).unwrap()
    const hostNamePrefix = 'aws-devenv-'
    const sshConfig = new SshConfig(ssh, hostNamePrefix, connectScriptPrefix)
    const config = await sshConfig.ensureValid()

    if (config.isErr()) {
        const err = config.err()
        getLogger().error(`codecatalyst: failed to add ssh config section: ${err.message}`)

        throw err
    }

    const runningDevEnv = await client.startDevEnvironmentWithProgress({
        id,
        spaceName: org.name,
        projectName: project.name,
    })

    const hostname = `${hostNamePrefix}${id}`
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
        devenv: runningDevEnv,
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
    client: CodeCatalystClient,
    devenv: DevEnvironmentId,
    targetPath?: string
): Promise<void> {
    const env = await prepareDevEnvConnection(client, devenv, { topic: 'connect' })

    if (!targetPath) {
        const repo = env.devenv.repositories.length === 1 ? env.devenv.repositories[0].repositoryName : undefined
        targetPath = repo ? `/projects/${repo}` : '/projects'
    }
    await startVscodeRemote(env.SessionProcess, env.hostname, targetPath, env.vscPath)
}

// The "codecatalyst_connect" metric should really be splt into two parts:
// 1. the setup/launch from the local machine
// 2. toolkit initialization on the remote
//
// Recording metrics like this is a lot more involved so for now we'll
// assume that if the first step succeeds, the user probably succeeded
// in connecting to the devenv
export const codeCatalystConnectCommand = Commands.declare(
    {
        id: '_aws.codecatalyst.connect',
        telemetryName: 'codecatalyst_connect',
    },
    () => (client, devenv, targetPath) => openDevEnv(client, devenv, targetPath)
)

export async function getDevfileLocation(client: DevEnvClient, root?: vscode.Uri) {
    const rootDirectory = root ?? vscode.workspace.workspaceFolders?.[0].uri
    if (!rootDirectory) {
        throw new Error('No root directory or Dev Environment folder found')
    }

    async function checkDefaultLocations(rootDirectory: vscode.Uri): Promise<vscode.Uri> {
        // Check the projects root location
        const devfileRoot = vscode.Uri.joinPath(vscode.Uri.parse('/projects'), 'devfile.yaml')
        if (await fileExists(devfileRoot.fsPath)) {
            return devfileRoot
        }

        // Check the location relative to the current directory
        const projectRoot = vscode.Uri.joinPath(rootDirectory, 'devfile.yaml')
        if (await fileExists(projectRoot.fsPath)) {
            return projectRoot
        }

        throw new Error('Devfile location was not found')
    }

    // TODO(sijaden): should make this load greedily and continously poll
    // latency is very high for some reason
    const devfileLocation = await client.getStatus().then((r) => r.location)
    if (!devfileLocation) {
        return checkDefaultLocations(rootDirectory)
    }

    if (areEqual(undefined, rootDirectory.fsPath, '/projects')) {
        return vscode.Uri.joinPath(rootDirectory, devfileLocation)
    }

    // we have /projects/repo, where MDE may or may not return [repo]/devfile.yaml
    const repo = path.basename(rootDirectory.fsPath)
    const splitDevfilePath = devfileLocation.split('/')
    const devfilePath = vscode.Uri.joinPath(rootDirectory, 'devfile.yaml')
    if (repo === splitDevfilePath[0] && (await fileExists(devfilePath.fsPath))) {
        return devfilePath
    }

    const baseLocation = vscode.Uri.joinPath(rootDirectory, devfileLocation)
    if (await fileExists(baseLocation.fsPath)) {
        return baseLocation
    }

    return checkDefaultLocations(rootDirectory)
}

/**
 * Given a collection of CodeCatalyst repos, try to find a corresponding devenv, if any
 */
export function associateDevEnv(
    client: CodeCatalystClient,
    repos: AsyncCollection<CodeCatalystRepo>
): AsyncCollection<CodeCatalystRepo & { devEnv?: DevEnvironment }> {
    return toCollection(async function* () {
        const devenvs = await client
            .listResources('devEnvironment')
            .flatten()
            .filter((env) => env.repositories.length > 0 && isDevenvVscode(env.ides))
            .toMap((env) => `${env.org.name}.${env.project.name}.${env.repositories[0].repositoryName}`)

        yield* repos.map((repo) => ({
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
