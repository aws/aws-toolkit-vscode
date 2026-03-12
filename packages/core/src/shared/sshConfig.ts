/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import { getLogger } from './logger/logger'
import { ChildProcess, ChildProcessResult } from './utilities/processUtils'
import { Result } from './utilities/result'
import { ToolkitError } from './errors'
import { getIdeProperties } from './extensionUtilities'
import { showConfirmationMessage } from './utilities/messages'
import { CancellationError } from './utilities/timeoutUtils'
import { getSshConfigPath } from './extensions/ssh'
import globals from './extensionGlobals'
import { fileExists, readFileAsString } from './filesystemUtilities'
import { chmodSync } from 'fs' // eslint-disable-line no-restricted-imports
import fs from './fs/fs'

const localize = nls.loadMessageBundle()

export class SshConfig {
    protected readonly configHostName: string
    protected readonly proxyCommandRegExp: RegExp

    public constructor(
        protected readonly sshPath: string,
        protected readonly hostNamePrefix: string,
        protected readonly scriptPrefix: string,
        protected readonly keyPath?: string
    ) {
        this.configHostName = `${hostNamePrefix}*`
        this.proxyCommandRegExp = new RegExp(`proxycommand.{0,1024}${scriptPrefix}(.ps1)?.{0,99}`)
    }

    protected isWin(): boolean {
        return process.platform === 'win32'
    }

    protected async getProxyCommand(command: string): Promise<Result<string, ToolkitError>> {
        // Use %n for SageMaker to preserve original hostname case (avoids SSH canonicalization lowercasing and DNS lookup)
        const hostnameToken = this.scriptPrefix === 'sagemaker_connect' ? '%n' : '%h'

        if (this.isWin()) {
            // Some older versions of OpenSSH (7.8 and below) have a bug where attempting to use powershell.exe directly will fail without an absolute path
            const proc = new ChildProcess('powershell.exe', ['-Command', '(get-command powershell.exe).Path'])
            const r = await proc.run()
            if (r.exitCode !== 0) {
                return Result.err(new ToolkitError('Failed to get absolute path for powershell', { cause: r.error }))
            }
            return Result.ok(`"${r.stdout}" -ExecutionPolicy RemoteSigned -File "${command}" ${hostnameToken}`)
        } else {
            return Result.ok(`'${command}' '${hostnameToken}'`)
        }
    }

    public async ensureValid() {
        const scriptResult = await ensureConnectScript(this.scriptPrefix)
        if (scriptResult.isErr()) {
            return scriptResult
        }

        const connectScript = scriptResult.ok()
        const proxyCommand = await this.getProxyCommand(connectScript.fsPath)
        if (proxyCommand.isErr()) {
            return proxyCommand
        }

        const verifyHost = await this.verifySSHHost(proxyCommand.unwrap())
        if (verifyHost.isErr()) {
            return verifyHost
        }

        return Result.ok()
    }

    protected async checkSshOnHost(): Promise<ChildProcessResult> {
        const proc = new ChildProcess(this.sshPath, ['-G', `${this.hostNamePrefix}test`])
        const result = await proc.run()
        return result
    }

    protected async matchSshSection() {
        // Check if our exact Host pattern exists in the config file
        const sshConfigPath = getSshConfigPath()
        const configExists = await fileExists(sshConfigPath)

        if (!configExists) {
            // No config file exists at all
            return Result.ok(undefined)
        }

        const configContent = await readFileAsString(sshConfigPath)
        const hostPattern = new RegExp(`^Host\\s+${this.configHostName.replace('*', '\\*')}\\s*$`, 'm')
        const hasExactHost = hostPattern.test(configContent)

        if (!hasExactHost) {
            // Our exact Host pattern doesn't exist
            return Result.ok(undefined)
        }

        // Our Host pattern exists, extract ProxyCommand directly from our specific Host block
        const lines = configContent.split('\n')
        let inOurHostBlock = false
        let proxyCommandLine = ''

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()

            // Check if this is our Host line
            if (hostPattern.test(line)) {
                inOurHostBlock = true
                continue
            }

            // If we're in our block and hit another Host line, we're done
            if (inOurHostBlock && line.startsWith('Host ')) {
                break
            }

            // If we're in our block, look for ProxyCommand
            if (inOurHostBlock && line.toLowerCase().startsWith('proxycommand ')) {
                proxyCommandLine = line
                break
            }
        }

        if (!proxyCommandLine) {
            // Host exists but no ProxyCommand found - return a marker to indicate corrupted entry
            return Result.ok('CORRUPTED_NO_PROXYCOMMAND')
        }

        // Extract the proxy command value and check if it matches our script
        const matches = proxyCommandLine.match(this.proxyCommandRegExp)

        if (!matches) {
            // ProxyCommand exists but doesn't match our script - return it as corrupted
            return Result.ok(proxyCommandLine)
        }

        return Result.ok(matches[0])
    }

    private async promptUserForOutdatedSection(configSection: string): Promise<void> {
        getLogger().warn(`SSH config: found old/outdated "${this.configHostName}" section:\n%O`, configSection)
        const oldConfig = localize(
            'AWS.sshConfig.error.oldConfig',
            'Your ~/.ssh/config has a {0} section that might be out of date. Delete it, then try again.',
            this.configHostName
        )

        const openConfig = localize('AWS.ssh.openConfig', 'Open config...')
        await vscode.window.showWarningMessage(oldConfig, openConfig).then((resp) => {
            if (resp === openConfig) {
                void vscode.window.showTextDocument(vscode.Uri.file(getSshConfigPath()))
            }
        })

        throw new ToolkitError(oldConfig, { code: 'OldConfig' })
    }

    protected async writeSectionToConfig(proxyCommand: string) {
        const sshConfigPath = getSshConfigPath()
        const section = this.createSSHConfigSection(proxyCommand)
        try {
            const parentsDir = path.dirname(sshConfigPath)
            const grandParentsDir = path.dirname(parentsDir)
            // TODO: replace w/ fs.chmod once stub is merged.
            await fs.mkdir(grandParentsDir)
            chmodSync(grandParentsDir, 0o755)

            await fs.mkdir(parentsDir)
            chmodSync(parentsDir, 0o700)

            await fs.appendFile(sshConfigPath, section)
            chmodSync(sshConfigPath, 0o600)
        } catch (e) {
            const message = localize(
                'AWS.sshConfig.error.writeFail',
                'Failed to write SSH config: {0} (permission issue?)',
                sshConfigPath
            )

            throw ToolkitError.chain(e, message, { code: 'ConfigWriteFailed' })
        }
    }

    public async promptUserToConfigureSshConfig(
        configSection: string | undefined,
        proxyCommand: string
    ): Promise<void> {
        if (configSection !== undefined) {
            await this.promptUserForOutdatedSection(configSection)
        }

        const confirmTitle = localize(
            'AWS.sshConfig.confirm.installSshConfig.title',
            '{0} Toolkit will add host {1} to ~/.ssh/config to use SSH with your Dev Environments',
            getIdeProperties().company,
            this.configHostName
        )
        const confirmText = localize('AWS.sshConfig.confirm.installSshConfig.button', 'Update SSH config')
        const response = await showConfirmationMessage({ prompt: confirmTitle, confirm: confirmText })
        if (!response) {
            throw new CancellationError('user')
        }

        await this.writeSectionToConfig(proxyCommand)
    }

    // Check if the hostname pattern is working.
    protected async verifySSHHost(proxyCommand: string) {
        const matchResult = await this.matchSshSection()
        if (matchResult.isErr()) {
            return matchResult
        }

        const configSection = matchResult.ok()

        if (configSection === undefined) {
            // Host entry doesn't exist, need to add it
            try {
                await this.promptUserToConfigureSshConfig(undefined, proxyCommand)
            } catch (e) {
                return Result.err(e as Error)
            }
            return Result.ok()
        }

        // Host entry exists, validate the proxy command
        // Extract the core script path (without quotes and hostname token) for comparison
        // Expected format: '/path/to/sagemaker_connect' '%n'
        const expectedPathMatch = proxyCommand.match(/['"]([^'"]+sagemaker_connect[^'"]*)['"]/)
        const expectedPath = expectedPathMatch ? expectedPathMatch[1] : null

        // The configSection from ssh -G will have format like: proxycommand /path/to/sagemaker_connect %n
        // Normalize both for comparison (remove quotes, extra spaces)
        const normalizedConfig = configSection
            .toLowerCase()
            .replace(/['"]|\s+/g, ' ')
            .trim()
        const normalizedExpected = expectedPath ? expectedPath.toLowerCase().replace(/\s+/g, ' ').trim() : ''

        const isValid = normalizedExpected && normalizedConfig.includes(normalizedExpected)

        if (!isValid) {
            // Proxy command is outdated or malformed
            try {
                await this.promptUserToConfigureSshConfig(configSection, proxyCommand)
            } catch (e) {
                return Result.err(e as Error)
            }
        }

        return Result.ok()
    }

    private getBaseSSHConfig(proxyCommand: string): string {
        // "AddKeysToAgent" will automatically add keys used on the server to the local agent. If not set, then `ssh-add`
        // must be done locally. It's mostly a convenience thing; private keys are _not_ shared with the server.
        // "IdentitiesOnly yes" forces agent to only use provided identity file.
        // More details: https://www.ssh.com/academy/ssh/config
        return `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host ${this.configHostName}
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand ${proxyCommand}
    IdentitiesOnly yes
    `
    }

    private getSageMakerSSHConfig(proxyCommand: string): string {
        return `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host ${this.configHostName}
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand ${proxyCommand}
    `
    }

    protected createSSHConfigSection(proxyCommand: string): string {
        if (this.scriptPrefix === 'sagemaker_connect') {
            return `${this.getSageMakerSSHConfig(proxyCommand)}`
        } else if (this.keyPath) {
            return `${this.getBaseSSHConfig(proxyCommand)}IdentityFile '${this.keyPath}'\n    User '%r'\n`
        }
        return this.getBaseSSHConfig(proxyCommand)
    }
}

export function sshLogFileLocation(service: string, id: string): string {
    return path.join(globals.context.globalStorageUri.fsPath, `${service}.${id}.log`)
}

export function constructScriptName(scriptPrefix: string) {
    return `${scriptPrefix}${process.platform === 'win32' ? '.ps1' : ''}`
}

export async function ensureConnectScript(
    scriptPrefix: string,
    context = globals.context
): Promise<Result<vscode.Uri, ToolkitError>> {
    const scriptName = constructScriptName(scriptPrefix)

    // Script resource path. Includes the Toolkit version string so it changes with each release.
    const versionedScript = vscode.Uri.joinPath(context.extensionUri, 'resources', scriptName)

    // Copy to globalStorage to ensure a "stable" path (not influenced by Toolkit version string.)
    const connectScript = vscode.Uri.joinPath(context.globalStorageUri, scriptName)

    try {
        const exists = await fileExists(connectScript.fsPath)
        const contents1 = await readFileAsString(versionedScript.fsPath)
        const contents2 = exists ? await readFileAsString(connectScript.fsPath) : ''
        const isOutdated = contents1 !== contents2

        if (isOutdated) {
            await fs.copy(versionedScript.fsPath, connectScript.fsPath)
            getLogger().info('ssh: updated connect script')
        }

        return Result.ok(connectScript)
    } catch (e) {
        const message = localize('AWS.sshConfig.error.copyScript', 'Failed to update connect script')

        return Result.err(ToolkitError.chain(e, message, { code: 'ConnectScriptUpdateFailed' }))
    }
}
