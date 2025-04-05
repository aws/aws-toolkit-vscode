/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Writable } from 'stream'
import { getLogger } from '../../shared/logger/logger'
import { fs } from '../../shared/fs/fs'
import { ChildProcess, ChildProcessOptions } from '../../shared/utilities/processUtils'
import { CommandValidation, InvokeOutput, OutputKind, sanitizePath } from './toolShared'
import { split } from 'shlex'

export enum CommandCategory {
    ReadOnly,
    HighRisk,
    Destructive,
}

export const dangerousPatterns = new Set(['<(', '$(', '`'])
export const splitOperators = new Set(['|', '&&', '||', '>'])
export const splitOperatorsArray = Array.from(splitOperators)
export const commandCategories = new Map<string, CommandCategory>([
    // ReadOnly commands
    ['ls', CommandCategory.ReadOnly],
    ['cat', CommandCategory.ReadOnly],
    ['bat', CommandCategory.ReadOnly],
    ['pwd', CommandCategory.ReadOnly],
    ['echo', CommandCategory.ReadOnly],
    ['file', CommandCategory.ReadOnly],
    ['less', CommandCategory.ReadOnly],
    ['more', CommandCategory.ReadOnly],
    ['tree', CommandCategory.ReadOnly],
    ['find', CommandCategory.ReadOnly],
    ['top', CommandCategory.ReadOnly],
    ['htop', CommandCategory.ReadOnly],
    ['ps', CommandCategory.ReadOnly],
    ['df', CommandCategory.ReadOnly],
    ['du', CommandCategory.ReadOnly],
    ['free', CommandCategory.ReadOnly],
    ['uname', CommandCategory.ReadOnly],
    ['date', CommandCategory.ReadOnly],
    ['whoami', CommandCategory.ReadOnly],
    ['which', CommandCategory.ReadOnly],
    ['ping', CommandCategory.ReadOnly],
    ['ifconfig', CommandCategory.ReadOnly],
    ['ip', CommandCategory.ReadOnly],
    ['netstat', CommandCategory.ReadOnly],
    ['ss', CommandCategory.ReadOnly],
    ['dig', CommandCategory.ReadOnly],
    ['grep', CommandCategory.ReadOnly],
    ['wc', CommandCategory.ReadOnly],
    ['sort', CommandCategory.ReadOnly],
    ['diff', CommandCategory.ReadOnly],
    ['head', CommandCategory.ReadOnly],
    ['tail', CommandCategory.ReadOnly],

    // HighRisk commands
    ['chmod', CommandCategory.HighRisk],
    ['chown', CommandCategory.HighRisk],
    ['mv', CommandCategory.HighRisk],
    ['cp', CommandCategory.HighRisk],
    ['ln', CommandCategory.HighRisk],
    ['mount', CommandCategory.HighRisk],
    ['umount', CommandCategory.HighRisk],
    ['kill', CommandCategory.HighRisk],
    ['killall', CommandCategory.HighRisk],
    ['pkill', CommandCategory.HighRisk],
    ['iptables', CommandCategory.HighRisk],
    ['route', CommandCategory.HighRisk],
    ['systemctl', CommandCategory.HighRisk],
    ['service', CommandCategory.HighRisk],
    ['crontab', CommandCategory.HighRisk],
    ['at', CommandCategory.HighRisk],
    ['tar', CommandCategory.HighRisk],
    ['awk', CommandCategory.HighRisk],
    ['sed', CommandCategory.HighRisk],
    ['wget', CommandCategory.HighRisk],
    ['curl', CommandCategory.HighRisk],
    ['nc', CommandCategory.HighRisk],
    ['ssh', CommandCategory.HighRisk],
    ['scp', CommandCategory.HighRisk],
    ['ftp', CommandCategory.HighRisk],
    ['sftp', CommandCategory.HighRisk],
    ['rsync', CommandCategory.HighRisk],
    ['chroot', CommandCategory.HighRisk],
    ['lsof', CommandCategory.HighRisk],
    ['strace', CommandCategory.HighRisk],
    ['gdb', CommandCategory.HighRisk],

    // Destructive commands
    ['rm', CommandCategory.Destructive],
    ['dd', CommandCategory.Destructive],
    ['mkfs', CommandCategory.Destructive],
    ['fdisk', CommandCategory.Destructive],
    ['shutdown', CommandCategory.Destructive],
    ['reboot', CommandCategory.Destructive],
    ['poweroff', CommandCategory.Destructive],
    ['sudo', CommandCategory.Destructive],
    ['su', CommandCategory.Destructive],
    ['useradd', CommandCategory.Destructive],
    ['userdel', CommandCategory.Destructive],
    ['passwd', CommandCategory.Destructive],
    ['visudo', CommandCategory.Destructive],
    ['insmod', CommandCategory.Destructive],
    ['rmmod', CommandCategory.Destructive],
    ['modprobe', CommandCategory.Destructive],
    ['apt', CommandCategory.Destructive],
    ['yum', CommandCategory.Destructive],
    ['dnf', CommandCategory.Destructive],
    ['pacman', CommandCategory.Destructive],
    ['perl', CommandCategory.Destructive],
    ['python', CommandCategory.Destructive],
    ['bash', CommandCategory.Destructive],
    ['sh', CommandCategory.Destructive],
    ['exec', CommandCategory.Destructive],
    ['eval', CommandCategory.Destructive],
    ['xargs', CommandCategory.Destructive],
])
export const maxBashToolResponseSize: number = 1024 * 1024 // 1MB
export const lineCount: number = 1024
export const destructiveCommandWarningMessage = '⚠️ WARNING: Destructive command detected:\n\n'
export const highRiskCommandWarningMessage = '⚠️ WARNING: High risk command detected:\n\n'

export interface ExecuteBashParams {
    command: string
    cwd?: string
}

export class ExecuteBash {
    private readonly command: string
    private readonly workingDirectory?: string
    private readonly logger = getLogger('executeBash')

    constructor(params: ExecuteBashParams) {
        this.command = params.command
        this.workingDirectory = params.cwd ? sanitizePath(params.cwd) : fs.getUserHomeDir()
    }

    public async validate(): Promise<void> {
        if (!this.command.trim()) {
            throw new Error('Bash command cannot be empty.')
        }

        const args = split(this.command)
        if (!args || args.length === 0) {
            throw new Error('No command found.')
        }

        try {
            await ExecuteBash.whichCommand(args[0])
        } catch {
            throw new Error(`Command "${args[0]}" not found on PATH.`)
        }
    }

    public requiresAcceptance(): CommandValidation {
        try {
            const args = split(this.command)
            if (!args || args.length === 0) {
                return { requiresAcceptance: true }
            }

            // Split commands by operators and process each segment
            let currentCmd: string[] = []
            const allCommands: string[][] = []

            for (const arg of args) {
                if (splitOperators.has(arg)) {
                    if (currentCmd.length > 0) {
                        allCommands.push(currentCmd)
                    }
                    currentCmd = []
                } else if (splitOperatorsArray.some((op) => arg.includes(op))) {
                    return { requiresAcceptance: true }
                } else {
                    currentCmd.push(arg)
                }
            }

            if (currentCmd.length > 0) {
                allCommands.push(currentCmd)
            }

            for (const cmdArgs of allCommands) {
                if (cmdArgs.length === 0) {
                    return { requiresAcceptance: true }
                }

                const command = cmdArgs[0]
                const category = commandCategories.get(command)

                switch (category) {
                    case CommandCategory.Destructive:
                        return { requiresAcceptance: true, warning: destructiveCommandWarningMessage }
                    case CommandCategory.HighRisk:
                        return {
                            requiresAcceptance: true,
                            warning: highRiskCommandWarningMessage,
                        }
                    case CommandCategory.ReadOnly:
                        if (
                            cmdArgs.some((arg) =>
                                Array.from(dangerousPatterns).some((pattern) => arg.includes(pattern))
                            )
                        ) {
                            return { requiresAcceptance: true, warning: highRiskCommandWarningMessage }
                        }
                        continue
                    default:
                        return { requiresAcceptance: true, warning: highRiskCommandWarningMessage }
                }
            }
            return { requiresAcceptance: false }
        } catch (error) {
            this.logger.warn(`Error while checking acceptance: ${(error as Error).message}`)
            return { requiresAcceptance: true }
        }
    }

    public async invoke(updates?: Writable): Promise<InvokeOutput> {
        this.logger.info(`Invoking bash command: "${this.command}" in cwd: "${this.workingDirectory}"`)

        return new Promise(async (resolve, reject) => {
            this.logger.debug(`Spawning process with command: bash -c "${this.command}" (cwd=${this.workingDirectory})`)

            const stdoutBuffer: string[] = []
            const stderrBuffer: string[] = []

            let firstChunk = true
            let firstStderrChunk = true
            const childProcessOptions: ChildProcessOptions = {
                spawnOptions: {
                    cwd: this.workingDirectory,
                    stdio: ['pipe', 'pipe', 'pipe'],
                },
                collect: false,
                waitForStreams: true,
                onStdout: (chunk: string) => {
                    ExecuteBash.handleChunk(firstChunk ? '```console\n' + chunk : chunk, stdoutBuffer, updates)
                    firstChunk = false
                },
                onStderr: (chunk: string) => {
                    ExecuteBash.handleChunk(firstStderrChunk ? '```console\n' + chunk : chunk, stderrBuffer, updates)
                    firstStderrChunk = false
                },
            }

            const childProcess = new ChildProcess('bash', ['-c', this.command], childProcessOptions)

            try {
                const result = await childProcess.run()
                const exitStatus = result.exitCode ?? 0
                const stdout = stdoutBuffer.join('\n')
                const stderr = stderrBuffer.join('\n')
                const [stdoutTrunc, stdoutSuffix] = ExecuteBash.truncateSafelyWithSuffix(
                    stdout,
                    maxBashToolResponseSize / 3
                )
                const [stderrTrunc, stderrSuffix] = ExecuteBash.truncateSafelyWithSuffix(
                    stderr,
                    maxBashToolResponseSize / 3
                )

                const outputJson = {
                    exitStatus: exitStatus.toString(),
                    stdout: stdoutTrunc + (stdoutSuffix ? ' ... truncated' : ''),
                    stderr: stderrTrunc + (stderrSuffix ? ' ... truncated' : ''),
                }

                resolve({
                    output: {
                        kind: OutputKind.Json,
                        content: outputJson,
                    },
                })
            } catch (err: any) {
                this.logger.error(`Failed to execute bash command '${this.command}': ${err.message}`)
                reject(new Error(`Failed to execute command: ${err.message}`))
            }
        })
    }

    private static handleChunk(chunk: string, buffer: string[], updates?: Writable) {
        try {
            updates?.write(chunk)
            const lines = chunk.split(/\r?\n/)
            for (const line of lines) {
                buffer.push(line)
                if (buffer.length > lineCount) {
                    buffer.shift()
                }
            }
        } catch (error) {
            // Log the error but don't let it crash the process
            throw new Error('Error handling output chunk')
        }
    }

    private static truncateSafelyWithSuffix(str: string, maxLength: number): [string, boolean] {
        if (str.length > maxLength) {
            return [str.substring(0, maxLength), true]
        }
        return [str, false]
    }

    private static async whichCommand(cmd: string): Promise<string> {
        const cp = new ChildProcess('which', [cmd], {
            collect: true,
            waitForStreams: true,
        })
        const result = await cp.run()

        if (result.exitCode !== 0) {
            throw new Error(`Command "${cmd}" not found on PATH.`)
        }

        const output = result.stdout.trim()
        if (!output) {
            throw new Error(`Command "${cmd}" found but 'which' returned empty output.`)
        }
        return output
    }

    public queueDescription(updates: Writable): void {
        updates.write(`I will run the following shell command:\n`)
        updates.write('```bash\n' + this.command + '\n```')
        updates.end()
    }
}
