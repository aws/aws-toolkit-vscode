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
import { getStringHash } from '../shared/utilities/textUtilities'
import { readFileAsString } from '../shared/filesystemUtilities'
import { VSCODE_MDE_TAGS } from './constants'
import { SystemUtilities } from '../shared/systemUtilities'
import { ChildProcess } from '../shared/utilities/childProcess'
import { getIdeProperties } from '../shared/extensionUtilities'
import { ext } from '../shared/extensionGlobals'
import { showConfirmationMessage, showViewLogsMessage } from '../shared/utilities/messages'
import { getLogger } from '../shared/logger/logger'
import * as settings from '../shared/settingsConfiguration'
import { AWS_CLIS, installCli } from '../shared/utilities/cliUtils'
import { getCliCommand } from '../shared/utilities/cliUtils'
import { normalize } from '../shared/utilities/pathUtils'

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

export function getStatusIcon(status: string): vscode.ThemeIcon {
    switch (status) {
        case 'RUNNING':
            return new vscode.ThemeIcon('pass')
        case 'STOPPED':
            return new vscode.ThemeIcon('stop')
        default:
            return new vscode.ThemeIcon('sync~spin')
    }
}

/**
 * Checks if the "aws-mde-*" SSH config hostname pattern is working, else prompts user to add it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
export async function ensureMdeSshConfig(): Promise<{ ok: boolean; err: string }> {
    const iswin = process.platform === 'win32'

    const bash = await SystemUtilities.findBashPath()
    if (!bash) {
        return { ok: false, err: 'bash not found' }
    }

    // Script resource path. Includes the Toolkit version string so it changes with each release.
    const mdeScriptRes = ext.context.asAbsolutePath(path.join('resources', 'mde_connect'))
    // Copy to globalStorage to ensure a "stable" path (not influenced by Toolkit version string.)
    const mdeScript = normalize(path.join(ext.context.globalStoragePath, 'mde_connect'))
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
    } catch (e) {
        getLogger().error('ensureMdeSshConfig: failed to update: %O\n%O', mdeScript, e)
        return { ok: false, err: 'failed to copy mde_connect' }
    }

    const mdeSshConfig = `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host aws-mde-*
ForwardAgent yes
ProxyCommand "${bash}" -c "'${mdeScript}' %h"
`
    const ssh = await SystemUtilities.findSshPath()
    if (!ssh && !iswin) {
        return { ok: false, err: 'ssh not found' }
    }
    // Check if the "aws-mde-*" hostname pattern is working.
    const proc = iswin
        ? new ChildProcess(true, bash, undefined, '-c', '/usr/bin/ssh -G aws-mde-test')
        : new ChildProcess(true, ssh!, undefined, '-G', 'aws-mde-test')
    const r = await proc.run()
    if (r.exitCode !== 0) {
        // Should never happen...
        return { ok: false, err: 'ssh failed' }
    }
    const matches = r.stdout.match(/proxycommand.*mde_connect/i)
    const hasMdeProxyCommand = matches && matches[0].includes(mdeScript)

    if (!hasMdeProxyCommand) {
        if (matches && matches[0]) {
            getLogger().warn('MDE: SSH config: found old/outdated aws-mde-* section:\n%O', matches[0])
            const oldConfig = localize(
                'AWS.mde.error.oldConfig',
                'Your ~/.ssh/config has a "aws-mde-*" section that might be out of date. Delete it, then try again.'
            )
            showViewLogsMessage(oldConfig)
            return { ok: false, err: 'old config' }
        }

        const confirmTitle = localize(
            'AWS.mde.confirm.installSshConfig.title',
            '{0} Toolkit will add host "aws-mde-*" to ~/.ssh/config. This allows you to use SSH with your {1} MDE environments.',
            getIdeProperties().company,
            getIdeProperties().company
        )
        const confirmText = localize('AWS.mde.confirm.installSshConfig.button', 'Update SSH config')
        const response = await showConfirmationMessage({ prompt: confirmTitle, confirm: confirmText })
        if (!response) {
            return { ok: false, err: 'user canceled' }
        }

        const sshConfigPath = path.join(SystemUtilities.getHomeDirectory(), '.ssh/config')
        try {
            fs.appendFileSync(sshConfigPath, mdeSshConfig)
        } catch (e) {
            getLogger().error('ensureMdeSshConfig: failed to write: %O', sshConfigPath)
            return { ok: false, err: 'write failed' }
        }
    }

    return { ok: true, err: '' }
}

/**
 * Checks if the SSM plugin CLI `session-manager-plugin` is available and
 * working, else prompts user to install it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
export async function ensureSsmCli(): Promise<{ ok: boolean; result: string }> {
    const s = new settings.DefaultSettingsConfiguration()
    let ssmPath: string | undefined
    if (!s.readDevSetting<boolean>('aws.developer.mde.forceInstallClis', 'boolean', true)) {
        ssmPath = await getCliCommand(AWS_CLIS.ssm)
    }
    if (!ssmPath) {
        try {
            await installCli('ssm')
        } catch {
            const failMsg = localize('AWS.mde.installSsmCli.failed', 'Failed to install SSM plugin')
            showViewLogsMessage(failMsg, vscode.window)
            return { ok: false, result: 'failed to install ssm' }
        }
    }
    ssmPath = await getCliCommand(AWS_CLIS.ssm)
    if (!ssmPath) {
        // Should never happen.
        return { ok: false, result: 'failed to find ssm after install' }
    }
    return { ok: true, result: ssmPath }
}
