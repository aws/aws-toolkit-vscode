/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import * as fs from 'fs-extra'
import { TagMap } from '../../types/clientmde'
import { Repository } from '../../types/git'
import { productName } from '../shared/constants'
import { GitExtension } from '../shared/extensions/git'
import * as mde from '../shared/clients/mdeClient'
import { getStringHash } from '../shared/utilities/textUtilities'
import { readFileAsString } from '../shared/filesystemUtilities'
import { HOST_NAME_PREFIX, VSCODE_MDE_TAGS } from './constants'
import { SystemUtilities } from '../shared/systemUtilities'
import { ChildProcess, ChildProcessResult } from '../shared/utilities/childProcess'
import { getIdeProperties } from '../shared/extensionUtilities'
import { showConfirmationMessage, showViewLogsMessage } from '../shared/utilities/messages'
import { getLogger } from '../shared/logger/logger'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import globals from '../shared/extensionGlobals'
import { isExtensionInstalledMsg } from '../shared/utilities/vsCodeUtils'
import { ToolkitError } from '../shared/toolkitError'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'

const localize = nls.loadMessageBundle()

type VSCODE_MDE_TAG_NAMES = keyof typeof VSCODE_MDE_TAGS

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
): Promise<Partial<{ [key in VSCODE_MDE_TAG_NAMES]: string }>> {
    const val: Partial<{ [key in VSCODE_MDE_TAG_NAMES]: string }> = {
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
    for (const tagName of Object.keys(tags) as VSCODE_MDE_TAG_NAMES[]) {
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

export async function ensureConnectScript(context = globals.context): Promise<string> {
    const scriptName = `mde_connect${process.platform === 'win32' ? '.ps1' : ''}`

    // Script resource path. Includes the Toolkit version string so it changes with each release.
    const mdeScriptRes = context.asAbsolutePath(path.join('resources', scriptName))

    // Copy to globalStorage to ensure a "stable" path (not influenced by Toolkit version string.)
    const mdeScript = path.join(context.globalStoragePath, scriptName)

    try {
        const contents1 = await readFileAsString(mdeScriptRes)
        let contents2 = ''
        if (fs.existsSync(mdeScript)) {
            contents2 = await readFileAsString(mdeScript)
        }
        const isOutdated = contents1 !== contents2
        if (isOutdated) {
            fs.copyFileSync(mdeScriptRes, mdeScript)
        }
        getLogger().info('ensureMdeSshConfig: updated mde_connect script: %O', mdeScript)

        return mdeScript
    } catch (e) {
        getLogger().error('ensureMdeSshConfig: failed to write mde_connect script: %O\n%O', mdeScript, e)
        throw new ToolkitError(localize('AWS.mde.error.copyScript', 'Failed to update script: {0}', mdeScript))
    }
}

function getSshConfigPath(): string {
    const sshConfigDir = path.join(SystemUtilities.getHomeDirectory(), '.ssh')
    return path.join(sshConfigDir, 'config')
}

/**
 * Checks if the "aws-mde-*" SSH config hostname pattern is working, else prompts user to add it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
export async function ensureMdeSshConfig(sshPath: string): Promise<{
    ok: boolean
    err:
        | ''
        | 'bash not found'
        | 'failed to copy mde_connect'
        | 'old config'
        | 'ssh failed'
        | 'user canceled'
        | 'write failed'
    msg: string
}> {
    const iswin = process.platform === 'win32'

    const bash = await SystemUtilities.findBashPath()
    if (!bash && !iswin) {
        return {
            ok: false,
            err: 'bash not found',
            msg: localize('AWS.mde.error.noBash', 'Cannot find required tool: bash'),
        }
    }

    let mdeScript: string
    try {
        mdeScript = await ensureConnectScript()
    } catch (e) {
        if (e instanceof ToolkitError) {
            return {
                ok: false,
                err: 'failed to copy mde_connect',
                msg: e.message,
            }
        }
        throw e
    }

    const proxyCommand = iswin
        ? `powershell.exe -ExecutionPolicy Bypass -File "${mdeScript}" %h`
        : `'${mdeScript}' '%h'`

    // The "Control" parts of the config enable SSH multiplexing. This causes SSH commands against a host
    // to use (or at least try to) a shared connection. One session becomes the primary, managing subsequent
    // connections. Specifying "ControlPersist" creates a daemon that can live without the Toolkit. It can be
    // communicated to using the "ControlPath" socket (or just `ssh` commands).
    //
    // A new SSM session only needs to be created if there is not an existing _working_ connection already in place.
    // If one already exists, "ProxyCommand" is not executed since it is only needed to establish a connection, not
    // maintain one.

    const configHostName = `${HOST_NAME_PREFIX}*`
    const mdeSshConfig = `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host ${configHostName}
    ForwardAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand ${proxyCommand}
    ControlMaster auto
    ControlPath ~/.ssh/%h
    ControlPersist 15m
`

    // Check if the "aws-mde-*" hostname pattern is working.
    const proc = new ChildProcess(sshPath, ['-G', `${HOST_NAME_PREFIX}test`])
    const r = await proc.run()
    if (r.exitCode !== 0) {
        // Should never happen...
        return {
            ok: false,
            err: 'ssh failed',
            msg: localize('AWS.mde.error.sshFail', 'ssh failed: {0}', mdeScript),
        }
    }
    const matches = r.stdout.match(/proxycommand.{0,1024}mde_connect(.ps1)?.{0,99}/i)
    const hasMdeProxyCommand = matches && matches[0].includes(proxyCommand)
    const hasControlPersist = !!r.stdout.match(/controlpersist [0-9]{1,99}/i)

    if (!hasMdeProxyCommand || !hasControlPersist) {
        if (matches && matches[0]) {
            getLogger().warn(`MDE: SSH config: found old/outdated "${configHostName}" section:\n%O`, matches[0])
            const oldConfig = localize(
                'AWS.mde.error.oldConfig',
                'Your ~/.ssh/config has a {0} section that might be out of date. Delete it, then try again.',
                configHostName
            )
            return { ok: false, err: 'old config', msg: oldConfig }
        }

        const confirmTitle = localize(
            'AWS.mde.confirm.installSshConfig.title',
            '{0} Toolkit will add host {1} to ~/.ssh/config. This allows you to use SSH with your {0} MDE environments.',
            getIdeProperties().company,
            configHostName
        )
        const confirmText = localize('AWS.mde.confirm.installSshConfig.button', 'Update SSH config')
        const response = await showConfirmationMessage({ prompt: confirmTitle, confirm: confirmText })
        if (!response) {
            return { ok: false, err: 'user canceled', msg: '' }
        }

        const sshConfigPath = getSshConfigPath()
        try {
            fs.mkdirpSync(path.dirname(sshConfigPath))
            fs.appendFileSync(sshConfigPath, mdeSshConfig)
        } catch (e) {
            getLogger().error('ensureMdeSshConfig: failed to write: %O', sshConfigPath)
            return {
                ok: false,
                err: 'write failed',
                msg: localize('AWS.mde.error.writeFail', 'Failed to write SSH config: {0}', sshConfigPath),
            }
        }
    }

    return { ok: true, err: '', msg: '' }
}

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
        },
        process.env
    )
}

export const SSH_AGENT_SOCKET_VARIABLE = 'SSH_AUTH_SOCK'

/**
 * Only mac has the agent running by default, other OS we need to start manually
 *
 * @returns `undefined` if agent is already running or on Windows, otherwise the SSH agent socket
 */
export async function startSshAgent(): Promise<string | undefined> {
    if (process.env[SSH_AGENT_SOCKET_VARIABLE] !== undefined) {
        return process.env[SSH_AGENT_SOCKET_VARIABLE]
    }

    getLogger().info('Starting SSH agent...')

    try {
        if (process.platform === 'win32') {
            const runningMessage = 'Already running'
            // First check if it's running
            // if not, try to start it
            // if that fails, try to set the start-up type to automatic
            // if that fails, then no agent
            const script = `
$info = Get-Service ssh-agent
if ($info.Status -eq "Running") { 
    echo "${runningMessage}"
    exit 0 
}
Start-Service ssh-agent
if (!$?) {
    Get-Service -Name ssh-agent | Set-Service -StartupType Manual
    if ($?) { Start-Service ssh-agent }
}
exit $?
`
            const result = await new ChildProcess('powershell.exe', ['Invoke-Expression', script]).run({
                rejectOnErrorCode: true,
            })

            if (!result.stdout.includes(runningMessage)) {
                vscode.window.showInformationMessage(
                    localize('AWS.mde.ssh-agent.start', 'The SSH agent has been started.')
                )
            }

            return
        }

        // TODO: this command outputs a shell command that you're supposed to execute, for now
        // we'll just parse the socket out and inject it into the ssh command
        const r = await new ChildProcess('ssh-agent', ['-s']).run()
        return (r.stdout.match(/$SSH_AGENT_VAR=(.*?);/) ?? [])[1]
    } catch (err) {
        getLogger().error('mde: failed to start SSH agent, clones may not work as expected: %O', err)
    }
}

/**
 * Starts an MDE session and connects a new vscode-remote instance to it.
 */
export async function connectToMde(
    args: Pick<mde.MdeEnvironment, 'id'>,
    region: string,
    startFn: () => Promise<mde.MdeSession | undefined>
): Promise<ChildProcessResult | undefined> {
    const deps = await ensureDependencies()
    if (!deps) {
        return
    }

    const { vsc, ssm, ssh } = deps
    const sshAgentSocket = await startSshAgent()

    const session = await startFn()
    if (!session) {
        return
    }

    await new Promise<void>((resolve, reject) => {
        new ChildProcess(ssh, ['-v', `${HOST_NAME_PREFIX}${args.id}`, 'echo "Host Ready"'])
            .run({
                rejectOnErrorCode: true,
                onStdout: text => {
                    // Not that robust. Should use different mechanism for knowing when process has been
                    // moved to the background.
                    if (text.includes('Host Ready')) {
                        resolve()
                    }
                },
                onStderr: text => {
                    getLogger().debug(`MDE connect (stderr): ${text}`)
                },
                spawnOptions: {
                    env: {
                        [SSH_AGENT_SOCKET_VARIABLE]: sshAgentSocket,
                        ...getMdeSsmEnv(region, ssm, session),
                    },
                },
            })
            .catch(reject)
    })

    // temporary until we can dynamically find the directory
    const projectDir = '/projects'
    const cmdArgs = ['--folder-uri', `vscode-remote://ssh-remote+${HOST_NAME_PREFIX}${args.id}${projectDir}`]

    const cmd = new ChildProcess(vsc, cmdArgs)

    const settings = new DefaultSettingsConfiguration()
    settings.ensureToolkitInVscodeRemoteSsh()

    getLogger().debug(
        `AWS_SSM_CLI='${ssm}' AWS_REGION='${region}' AWS_MDE_SESSION='${session.id}' AWS_MDE_STREAMURL='${session.accessDetails.streamUrl}' AWS_MDE_TOKEN='${session.accessDetails.tokenValue}' ssh '${HOST_NAME_PREFIX}${args.id}'`
    )
    getLogger().debug(
        `"${ssm}" "{\\"streamUrl\\":\\"${session.accessDetails.streamUrl}\\",\\"tokenValue\\":\\"${session.accessDetails.tokenValue}\\",\\"sessionId\\":\\"\\"}" "${region}" "StartSession"`
    )

    // Note: `await` is intentionally not used.
    return cmd
        .run({
            onStdout(stdout) {
                getLogger().verbose(`MDE connect: ${args.id}: ${stdout}`)
            },
            onStderr(stderr) {
                getLogger().verbose(`MDE connect: ${args.id}: ${stderr}`)
            },
        })
        .then(o => {
            if (o.exitCode !== 0) {
                getLogger().error('MDE connect: failed to start: %O', cmd)
            }
            return o
        })
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
