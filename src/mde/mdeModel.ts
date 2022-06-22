/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as path from 'path'
import { TagMap } from '../../types/clientmde'
import { Repository } from '../../types/git'
import { productName } from '../shared/constants'
import { GitExtension } from '../shared/extensions/git'
import * as mde from '../shared/clients/mdeClient'
import { getStringHash } from '../shared/utilities/textUtilities'
import { VSCODE_MDE_TAGS } from './constants'
import { SystemUtilities } from '../shared/systemUtilities'
import { ChildProcess } from '../shared/utilities/childProcess'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { getLogger } from '../shared/logger/logger'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { isExtensionInstalledMsg } from '../shared/utilities/vsCodeUtils'
import { RemoteSshSettings } from '../shared/settings'
import { ensureMdeSshConfig, getSshConfigPath, SSH_AGENT_SOCKET_VARIABLE, startSshAgent } from './mdeSSHConfig'
import globals from '../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

type TagName = keyof typeof VSCODE_MDE_TAGS

/**
 * Creates tags tied to friendly names for lookup on the VS Code side, like filtering.
 * e.g.
 * ```
 * { "repository" : "https://www.github.com/aws/aws-toolkit-vscode" , ... }
 * ```
 * @param repo Repository object from the Git API
 */
export async function createTagValuesFromRepo(
    repo: Pick<Repository, 'state'>,
    git: Pick<GitExtension, 'getConfig'> = GitExtension.instance
): Promise<Partial<{ [key in TagName]: string }>> {
    const val: Partial<{ [key in TagName]: string }> = {
        repository: repo.state.remotes[0]?.fetchUrl ?? '',
        repositoryBranch: repo.state.HEAD?.name ?? '',
        tool: productName,
    }
    const hash = await getEmailHash(git)
    if (hash) {
        val.email = hash
    }

    return val
}

/**
 * Creates a tag map with descriptive tag names for immediate write to MDE environment
 * e.g.
 * ```
 * { "aws:mde:repository" : "https://www.github.com/aws/aws-toolkit-vscode" , ... }
 * ```
 * @param repo Repository object from the Git API
 */
export async function createTagMapFromRepo(
    repo: Pick<Repository, 'state'>,
    git: Pick<GitExtension, 'getConfig'> = GitExtension.instance
): Promise<TagMap> {
    const tags = await createTagValuesFromRepo(repo, git)
    const final: TagMap = {}
    for (const tagName of Object.keys(tags) as TagName[]) {
        final[VSCODE_MDE_TAGS[tagName]] = tags[tagName]!
    }

    return final
}

export async function getEmailHash(
    git: Pick<GitExtension, 'getConfig'> = GitExtension.instance
): Promise<string | undefined> {
    const email = (await git.getConfig())['user.email']
    if (email) {
        return getStringHash(email)
    }
}

// TODO: Get Cloud9 icons, don't return vscode.ThemeIcon?
//       add second parameter for theme color when VS Code minver is bumped, e.g. new vscode.ThemeColor('charts.green')
export function getStatusIcon(status: string): vscode.ThemeIcon {
    switch (status) {
        case 'RUNNING':
            return new vscode.ThemeIcon('pass')
        case 'STOPPED':
            return new vscode.ThemeIcon('stop-circle')
        case 'FAILED':
            return new vscode.ThemeIcon('error')
        case 'DELETING':
        case 'DELETED':
            return new vscode.ThemeIcon('trash')
        default:
            return new vscode.ThemeIcon('sync~spin')
    }
}

export function makeLabelsString(env: Pick<mde.MdeEnvironment, 'tags'>): string {
    const labels = getTagsAndLabels(env).labels

    return labels.sort((a, b) => a.localeCompare(b)).join(' | ')
}

export function getTagsAndLabels(env: Pick<mde.MdeEnvironment, 'tags'>): { tags: TagMap; labels: string[] } {
    const vals = { tags: {} as TagMap, labels: [] as string[] }
    if (env.tags) {
        for (const key of Object.keys(env.tags)) {
            const val = env.tags[key]
            if (val) {
                vals.tags[key] = val
            } else {
                vals.labels.push(key)
            }
        }
    }

    return vals
}

export const MDE_STATUS_PRIORITY = new Map<string, number>([
    ['PENDING', 1],
    ['RUNNING', 0],
    ['STARTING', 3],
    ['STOPPING', 4],
    ['STOPPED', 5],
    ['FAILED', 2],
    ['DELETING', 6],
    ['DELETED', 7],
])

/**
 * Checks if the SSM plugin CLI `session-manager-plugin` is available and
 * working, else prompts user to install it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
export async function ensureSsmCli(): Promise<{ ok: boolean; result: string }> {
    return getOrInstallCli('session-manager-plugin', false)
        .then(ssmPath => {
            return { ok: true, result: ssmPath }
        })
        .catch(e => {
            return { ok: false, result: e.message }
        })
}

export function getMdeSsmEnv(region: string, ssmPath: string, session: mde.MdeSession): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: region,
            AWS_SSM_CLI: ssmPath,
            AWS_MDE_SESSION: session.id,
            AWS_MDE_STREAMURL: session.accessDetails.streamUrl,
            AWS_MDE_TOKEN: session.accessDetails.tokenValue,
            LOG_FILE_LOCATION: sshLogFileLocation(session.id),
        },
        process.env
    )
}

function sshLogFileLocation(sessionId: string): string {
    return path.join(globals.context.globalStorageUri.fsPath, `mde.${sessionId}.log`)
}

interface DependencyPaths {
    vsc: string
    ssm: string
    ssh: string
}

export async function ensureDependencies(window = vscode.window): Promise<DependencyPaths | undefined> {
    if (!isExtensionInstalledMsg('ms-vscode-remote.remote-ssh', 'Remote SSH', 'Connecting to environment')) {
        return
    }

    function showMissingToolMsg(s: string) {
        const m = localize(
            'AWS.mde.missingRequiredTool',
            'Failed to connect to environment, missing required tool: {0}',
            s
        )
        showViewLogsMessage(m, window)
    }

    const vsc = await SystemUtilities.getVscodeCliPath()
    if (!vsc) {
        showMissingToolMsg('code')
        return
    }

    const ssh = await SystemUtilities.findSshPath()
    if (!ssh) {
        showMissingToolMsg('ssh')
        return
    }

    const ssm = await ensureSsmCli().then(({ ok, result }) => {
        if (!ok) {
            getLogger().error(`ensureDependencies: missing SSM CLI: %O`, result)
            return
        }
        return result
    })
    if (!ssm) {
        showMissingToolMsg('ssm')
        return
    }

    const hasSshConfig = await ensureMdeSshConfig(ssh)
    if (!hasSshConfig.ok) {
        if (hasSshConfig.err === 'old config') {
            const openConfig = localize('AWS.ssh.openConfig', 'Open config...')
            vscode.window.showWarningMessage(hasSshConfig.msg, openConfig).then(resp => {
                if (resp === openConfig) {
                    vscode.window.showTextDocument(vscode.Uri.file(getSshConfigPath()))
                }
            })
        } else if (hasSshConfig.msg) {
            showViewLogsMessage(hasSshConfig.msg, window)
        }

        return
    }

    return { vsc, ssm, ssh }
}

export interface SessionDetails {
    readonly id: string
    readonly region: string
    readonly ssmPath: string
    readonly accessDetails: {
        readonly streamUrl: string
        readonly tokenValue: string
    }
}

async function createMdeSessionProvider(
    client: mde.MdeClient,
    ssmPath: string,
    env: Pick<mde.MdeEnvironment, 'id'>
): Promise<SessionDetails> {
    const session = await client.startSession({ id: env.id })

    return {
        region: client.regionCode,
        ssmPath,
        ...session,
    }
}

export type EnvProvider = () => Promise<NodeJS.ProcessEnv>

export function createMdeEnvProvider(
    client: mde.MdeClient,
    ssmPath: string,
    env: Pick<mde.MdeEnvironment, 'id'>,
    useSshAgent = true
): EnvProvider {
    return async () => {
        const session = await createMdeSessionProvider(client, ssmPath, env)
        const vars = getMdeSsmEnv(client.regionCode, ssmPath, session)

        return useSshAgent ? { [SSH_AGENT_SOCKET_VARIABLE]: await startSshAgent(), ...vars } : vars
    }
}

/**
 * Creates a new {@link ChildProcess} class bound to a specific CAWS workspace. All instances of this
 * derived class will have SSM session information injected as environment variables as-needed.
 */
export function createBoundProcess<T>(envProvider: EnvProvider): typeof ChildProcess {
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

export async function startVscodeRemote(
    ProcessClass: typeof ChildProcess,
    hostname: string,
    targetDirectory: string,
    vscPath: string
): Promise<void> {
    const workspaceUri = `vscode-remote://ssh-remote+${hostname}${targetDirectory}`

    if (process.platform === 'win32') {
        const settings = new RemoteSshSettings()

        await Promise.all([
            // TODO(sijaden): we should periodically clean this setting up, maybe
            // by removing all hostnames that use the `aws-mde-` prefix
            await settings.setRemotePlatform(hostname, 'linux'),

            // TODO(sijaden): revert this setting back to normal after the user connects
            await settings.update('useLocalServer', false),
        ])
    }
    await new ProcessClass(vscPath, ['--folder-uri', workspaceUri]).run({ rejectOnErrorCode: true })
}
