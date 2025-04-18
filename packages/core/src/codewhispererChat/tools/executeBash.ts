/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Writable } from 'stream'
import { getLogger } from '../../shared/logger/logger'
import { fs } from '../../shared/fs/fs'
import { ChildProcess, ChildProcessOptions } from '../../shared/utilities/processUtils'
import { InvokeOutput, OutputKind, sanitizePath } from './toolShared'
import { split } from 'shlex'
import path from 'path'
import * as vscode from 'vscode'
import { isInDirectory } from '../../shared/filesystemUtilities'

export enum CommandCategory {
    ReadOnly,
    Mutate,
    Destructive,
}

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
    ['wc', CommandCategory.ReadOnly],
    ['sort', CommandCategory.ReadOnly],
    ['diff', CommandCategory.ReadOnly],
    ['head', CommandCategory.ReadOnly],
    ['tail', CommandCategory.ReadOnly],

    // Mutable commands
    ['chmod', CommandCategory.Mutate],
    ['curl', CommandCategory.Mutate],
    ['mount', CommandCategory.Mutate],
    ['umount', CommandCategory.Mutate],
    ['systemctl', CommandCategory.Mutate],
    ['service', CommandCategory.Mutate],
    ['crontab', CommandCategory.Mutate],
    ['at', CommandCategory.Mutate],
    ['nc', CommandCategory.Mutate],
    ['ssh', CommandCategory.Mutate],
    ['scp', CommandCategory.Mutate],
    ['ftp', CommandCategory.Mutate],
    ['sftp', CommandCategory.Mutate],
    ['rsync', CommandCategory.Mutate],
    ['chroot', CommandCategory.Mutate],
    ['strace', CommandCategory.Mutate],
    ['gdb', CommandCategory.Mutate],
    ['apt', CommandCategory.Mutate],
    ['yum', CommandCategory.Mutate],
    ['dnf', CommandCategory.Mutate],
    ['pacman', CommandCategory.Mutate],
    ['exec', CommandCategory.Mutate],
    ['eval', CommandCategory.Mutate],
    ['xargs', CommandCategory.Mutate],

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
    ['kill', CommandCategory.Destructive],
    ['killall', CommandCategory.Destructive],
    ['pkill', CommandCategory.Destructive],
    ['iptables', CommandCategory.Destructive],
    ['route', CommandCategory.Destructive],
    ['chown', CommandCategory.Destructive],
])
export const maxBashToolResponseSize: number = 1024 * 1024 // 1MB
export const lineCount: number = 1024
export const destructiveCommandWarningMessage = '⚠️ WARNING: Destructive command detected:\n\n'
export const mutateCommandWarningMessage = 'Mutation command:\n\n'

export interface ExecuteBashParams {
    command: string
    cwd?: string
    explanation?: string
    triggerId?: string
}

export interface CommandValidation {
    requiresAcceptance: boolean
    warning?: string
}

// Interface for timestamped output chunks
interface TimestampedChunk {
    timestamp: number
    isStdout: boolean
    content: string
    isFirst: boolean
}

export class ExecuteBash {
    private readonly command: string
    private readonly workingDirectory?: string
    private readonly logger = getLogger('executeBash')
    private childProcess?: ChildProcess
    // Make triggerId writable so it can be set after construction
    private _triggerId?: string

    constructor(params: ExecuteBashParams) {
        this.command = params.command
        this.workingDirectory = params.cwd ? sanitizePath(params.cwd) : fs.getUserHomeDir()
        this._triggerId = params.triggerId
    }

    // Getter and setter for triggerId
    get triggerId(): string | undefined {
        return this._triggerId
    }

    set triggerId(id: string | undefined) {
        this._triggerId = id
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

                // For each command, validate arguments for path safety within workspace
                for (const arg of cmdArgs) {
                    if (this.looksLikePath(arg)) {
                        // If not absolute, resolve using workingDirectory if available.
                        let fullPath = arg
                        if (!path.isAbsolute(arg) && this.workingDirectory) {
                            fullPath = path.join(this.workingDirectory, arg)
                        }
                        const workspaceFolders = vscode.workspace.workspaceFolders
                        if (!workspaceFolders || workspaceFolders.length === 0) {
                            return { requiresAcceptance: true, warning: destructiveCommandWarningMessage }
                        }
                        const isInWorkspace = workspaceFolders.some((folder) =>
                            isInDirectory(folder.uri.fsPath, fullPath)
                        )
                        if (!isInWorkspace) {
                            return { requiresAcceptance: true, warning: destructiveCommandWarningMessage }
                        }
                    }
                }

                const command = cmdArgs[0]
                const category = commandCategories.get(command)

                switch (category) {
                    case CommandCategory.Destructive:
                        return { requiresAcceptance: true, warning: destructiveCommandWarningMessage }
                    case CommandCategory.Mutate:
                        return { requiresAcceptance: true, warning: mutateCommandWarningMessage }
                    case CommandCategory.ReadOnly:
                        continue
                    default:
                        return { requiresAcceptance: true }
                }
            }
            return { requiresAcceptance: false }
        } catch (error) {
            this.logger.warn(`Error while checking acceptance: ${(error as Error).message}`)
            return { requiresAcceptance: true }
        }
    }

    /**
     * Check if the trigger has been cancelled using ConversationTracker
     */
    private isTriggerCancelled(): boolean {
        if (!this.triggerId) {
            return false
        }

        // Import here to avoid circular dependency
        const { ConversationTracker } = require('../storages/conversationTracker')
        const cancellationtracker = ConversationTracker.getInstance()
        return cancellationtracker.isTriggerCancelled(this.triggerId)
    }

    public async invoke(updates?: Writable): Promise<InvokeOutput> {
        this.logger.info(`Invoking bash command: "${this.command}" in cwd: "${this.workingDirectory}"`)

        return new Promise(async (resolve, reject) => {
            // Check if cancelled before starting using triggerId
            if (this.isTriggerCancelled()) {
                this.logger.debug('Bash command execution cancelled before starting')
                reject(new Error('Command execution cancelled'))
                return
            }

            // Modify the command to make it more cancellable by using process groups
            // This ensures that when we kill the parent process, all child processes are also terminated
            // The trap ensures cleanup on SIGTERM/SIGINT and sends SIGTERM to the child process group
            const modifiedCommand = `
exec bash -c "
  # Create a new process group
  set -m
  
  # Set up trap to kill the entire process group on exit
  trap 'kill -TERM -\\$CMD_PID 2>/dev/null || true; exit' TERM INT
  
  # Run the actual command in background
  # Use '()' to create a subshell which becomes the process group leader
  (${this.command}) &
  
  # Store the PID
  CMD_PID=\\$!
  
  # Wait for the command to finish
  wait \\$CMD_PID
  exit_code=\\$?
  exit \\$exit_code
"
`

            this.logger.debug(
                `Spawning process with modified command for better cancellation support (cwd=${this.workingDirectory})`
            )

            const stdoutBuffer: string[] = []
            const stderrBuffer: string[] = []

            // Use a closure boolean value firstChunk and a function to get and set its value
            let isFirstChunk = true
            const getAndSetFirstChunk = (newValue: boolean): boolean => {
                const oldValue = isFirstChunk
                isFirstChunk = newValue
                return oldValue
            }

            // Use a queue to maintain chronological order of chunks
            // This ensures that the output is processed in the exact order it was generated by the child process.
            const outputQueue: TimestampedChunk[] = []
            let processingQueue = false

            // Process the queue in order
            const processQueue = () => {
                if (processingQueue || outputQueue.length === 0) {
                    return
                }

                processingQueue = true

                try {
                    // Sort by timestamp to ensure chronological order
                    outputQueue.sort((a, b) => a.timestamp - b.timestamp)

                    while (outputQueue.length > 0) {
                        const chunk = outputQueue.shift()!
                        ExecuteBash.handleTimestampedChunk(chunk, stdoutBuffer, stderrBuffer, updates)
                    }
                } finally {
                    processingQueue = false
                }
            }

            // Setup a periodic check for trigger cancellation
            let checkCancellationInterval: NodeJS.Timeout | undefined
            if (this.triggerId) {
                checkCancellationInterval = setInterval(() => {
                    if (this.isTriggerCancelled()) {
                        this.logger.debug('Trigger cancellation detected, killing child process')

                        // First try to kill the entire process group
                        if (this.childProcess && this.childProcess.pid) {
                            try {
                                // On Unix systems, negative PID kills the process group
                                const pid = -this.childProcess.pid
                                this.logger.debug(`Sending SIGTERM to process group ${pid}`)
                                process.kill(pid, 'SIGTERM')
                            } catch (err) {
                                this.logger.debug(`Failed to kill process group: ${err}`)
                                // Fall back to regular process termination
                                this.childProcess?.stop(false, 'SIGTERM')
                            }
                        } else {
                            this.childProcess?.stop(false, 'SIGTERM')
                        }

                        // After a short delay, force kill with SIGKILL if still running
                        setTimeout(() => {
                            if (this.childProcess && !this.childProcess.stopped) {
                                this.logger.debug('Process still running after SIGTERM, sending SIGKILL')

                                // Try to kill the process group with SIGKILL
                                if (this.childProcess.pid) {
                                    try {
                                        const pid = -this.childProcess.pid
                                        this.logger.debug(`Sending SIGKILL to process group ${pid}`)
                                        process.kill(pid, 'SIGKILL')
                                    } catch (err) {
                                        this.logger.debug(`Failed to kill process group with SIGKILL: ${err}`)
                                        // Fall back to regular process termination
                                        this.childProcess.stop(true, 'SIGKILL')
                                    }
                                } else {
                                    this.childProcess.stop(true, 'SIGKILL')
                                }
                            }
                        }, 500)

                        if (checkCancellationInterval) {
                            clearInterval(checkCancellationInterval)
                        }

                        // Return from the function after cancellation
                        reject(new Error('Command execution cancelled'))
                        return
                    }
                }, 100) // Check every 100ms
            }

            const childProcessOptions: ChildProcessOptions = {
                spawnOptions: {
                    cwd: this.workingDirectory,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    // Set detached to true to create a new process group
                    // This allows us to kill the entire process group later
                    detached: true,
                    // On Windows, we need to create a new process group
                    // On Unix, we need to create a new session
                    ...(process.platform === 'win32' ? { windowsVerbatimArguments: true } : {}),
                },
                collect: false,
                waitForStreams: true,
                onStdout: async (chunk: string) => {
                    if (this.isTriggerCancelled()) {
                        this.logger.debug('Bash command execution cancelled during stdout processing')
                        return
                    }
                    const isFirst = getAndSetFirstChunk(false)
                    const timestamp = Date.now()
                    outputQueue.push({
                        timestamp,
                        isStdout: true,
                        content: chunk,
                        isFirst,
                    })
                    processQueue()
                },
                onStderr: async (chunk: string) => {
                    if (this.isTriggerCancelled()) {
                        this.logger.debug('Bash command execution cancelled during stderr processing')
                        return
                    }
                    const isFirst = getAndSetFirstChunk(false)
                    const timestamp = Date.now()
                    outputQueue.push({
                        timestamp,
                        isStdout: false,
                        content: chunk,
                        isFirst,
                    })
                    processQueue()
                },
            }

            // Use bash directly with the modified command
            this.childProcess = new ChildProcess('bash', ['-c', modifiedCommand], childProcessOptions)

            try {
                const result = await this.childProcess.run()

                // Clean up the interval if it exists
                if (checkCancellationInterval) {
                    clearInterval(checkCancellationInterval)
                }

                // Check if cancelled after execution
                if (this.isTriggerCancelled()) {
                    this.logger.debug('Bash command execution cancelled after completion')
                    reject(new Error('Command execution cancelled'))
                    return
                }

                const exitStatus = result.exitCode ?? 0
                const stdout = stdoutBuffer.join('\n')
                const stderr = stderrBuffer.join('\n')
                const success = exitStatus === 0 && !stderr
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
                        success,
                    },
                })
            } catch (err: any) {
                // Clean up the interval if it exists
                if (checkCancellationInterval) {
                    clearInterval(checkCancellationInterval)
                }

                // Check if this was due to cancellation
                if (this.isTriggerCancelled()) {
                    reject(new Error('Command execution cancelled'))
                } else {
                    this.logger.error(`Failed to execute bash command '${this.command}': ${err.message}`)
                    reject(new Error(`Failed to execute command: ${err.message}`))
                }
            }
        })
    }

    private static handleTimestampedChunk(
        chunk: TimestampedChunk,
        stdoutBuffer: string[],
        stderrBuffer: string[],
        updates?: Writable
    ): void {
        const buffer = chunk.isStdout ? stdoutBuffer : stderrBuffer
        const content = chunk.isFirst ? '```console\n' + chunk.content : chunk.content
        ExecuteBash.handleChunk(content, buffer, updates)
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
        updates.write('```shell\n' + this.command + '\n```')
        updates.end()
    }

    private looksLikePath(arg: string): boolean {
        return arg.startsWith('/') || arg.startsWith('./') || arg.startsWith('../')
    }
}
