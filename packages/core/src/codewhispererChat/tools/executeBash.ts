/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Writable } from 'stream'
import { getLogger } from '../../shared/logger/logger'
import { fs } from '../../shared/fs/fs' // e.g. for getUserHomeDir()
import { ChildProcess, ChildProcessOptions } from '../../shared/utilities/processUtils'
import { InvokeOutput, OutputKind, sanitizePath } from './toolShared'

export const readOnlyCommands: string[] = ['ls', 'cat', 'echo', 'pwd', 'which', 'head', 'tail']
export const maxBashToolResponseSize: number = 1024 * 1024 // 1MB
export const lineCount: number = 1024
export const dangerousPatterns: string[] = ['|', '<(', '$(', '`', '>', '&&', '||']

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

        const args = ExecuteBash.parseCommand(this.command)
        if (!args || args.length === 0) {
            throw new Error('No command found.')
        }

        try {
            await ExecuteBash.whichCommand(args[0])
        } catch {
            throw new Error(`Command "${args[0]}" not found on PATH.`)
        }
    }

    public requiresAcceptance(): boolean {
        try {
            const args = ExecuteBash.parseCommand(this.command)
            if (!args || args.length === 0) {
                return true
            }

            if (args.some((arg) => dangerousPatterns.some((pattern) => arg.includes(pattern)))) {
                return true
            }

            const command = args[0]
            return !readOnlyCommands.includes(command)
        } catch (error) {
            this.logger.warn(`Error while checking acceptance: ${(error as Error).message}`)
            return true
        }
    }

    public async invoke(updates: Writable): Promise<InvokeOutput> {
        this.logger.info(`Invoking bash command: "${this.command}" in cwd: "${this.workingDirectory}"`)

        return new Promise(async (resolve, reject) => {
            this.logger.debug(`Spawning process with command: bash -c "${this.command}" (cwd=${this.workingDirectory})`)

            const stdoutBuffer: string[] = []
            const stderrBuffer: string[] = []

            const childProcessOptions: ChildProcessOptions = {
                spawnOptions: {
                    cwd: this.workingDirectory,
                    stdio: ['pipe', 'pipe', 'pipe'],
                },
                collect: false,
                waitForStreams: true,
                onStdout: (chunk: string) => {
                    ExecuteBash.handleChunk(chunk, stdoutBuffer, updates)
                },
                onStderr: (chunk: string) => {
                    ExecuteBash.handleChunk(chunk, stderrBuffer, updates)
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

    private static handleChunk(chunk: string, buffer: string[], updates: Writable) {
        try {
            const lines = chunk.split(/\r?\n/)
            for (const line of lines) {
                updates.write(`${line}\n`)
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

    private static parseCommand(command: string): string[] | undefined {
        const result: string[] = []
        let current = ''
        let inQuote: string | undefined
        let escaped = false

        for (const char of command) {
            if (escaped) {
                current += char
                escaped = false
            } else if (char === '\\') {
                escaped = true
            } else if (inQuote) {
                if (char === inQuote) {
                    inQuote = undefined
                } else {
                    current += char
                }
            } else if (char === '"' || char === "'") {
                inQuote = char
            } else if (char === ' ' || char === '\t') {
                if (current) {
                    result.push(current)
                    current = ''
                }
            } else {
                current += char
            }
        }

        if (current) {
            result.push(current)
        }

        return result
    }

    public queueDescription(updates: Writable): void {
        updates.write(`I will run the following shell command: `)

        if (this.command.length > 20) {
            updates.write('\n')
        }
        updates.write(`\x1b[32m${this.command}\x1b[0m\n`)
    }
}
