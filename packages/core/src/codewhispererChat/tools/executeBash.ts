/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// execute_bash.ts

/* eslint-disable no-restricted-imports */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable unicorn/no-null */
import { spawn } from 'child_process'
import * as readline from 'readline'
import { Writable } from 'stream'
import { fs } from '../../shared/fs/fs'

// Constants
const READONLY_COMMANDS: string[] = ['ls', 'cat', 'echo', 'pwd', 'which', 'head', 'tail']
const MAX_TOOL_RESPONSE_SIZE: number = 1024 * 1024 // Assuming 1MB as max response size
const LINE_COUNT: number = 1024

// Dangerous patterns that require user acceptance
const DANGEROUS_PATTERNS: string[] = ['|', '<(', '$(', '`', '>', '&&', '||']

/**
 * Interface for execute bash command parameters
 */
export interface ExecuteBashParams {
    command: string
    cwd?: string
}

/**
 * Interface for invoke output
 */
export interface InvokeOutput {
    output: OutputKind
}

/**
 * Output kind for tool responses
 */
export type OutputKind = { type: 'json'; content: any } | { type: 'text'; content: string }

/**
 * ExecuteBash class for handling bash command execution
 */
export class ExecuteBash {
    command: string
    cwd?: string

    constructor(params: ExecuteBashParams) {
        this.command = params.command
        this.cwd = params.cwd
    }

    /**
     * Determines if the command requires user acceptance before execution
     */
    requiresAcceptance(): boolean {
        try {
            const args = this.parseCommand(this.command)

            if (!args || args.length === 0) {
                return true
            }

            // Check for dangerous patterns
            if (args.some((arg) => DANGEROUS_PATTERNS.some((pattern) => arg.includes(pattern)))) {
                return true
            }

            // Check if it's a readonly command
            const cmd = args[0]
            return !READONLY_COMMANDS.includes(cmd)
        } catch {
            return true
        }
    }

    /**
     * Parse command string into arguments (simplified shlex equivalent)
     */
    private parseCommand(command: string): string[] | null {
        // Simple shell-like parsing (not as robust as shlex)
        const result: string[] = []
        let current = ''
        let inQuote: string | null = null
        let escaped = false

        for (const char of command) {
            if (escaped) {
                current += char
                escaped = false
            } else if (char === '\\') {
                escaped = true
            } else if (inQuote) {
                if (char === inQuote) {
                    inQuote = null
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

    /**
     * Truncate a string safely to a maximum length
     */
    private truncateSafe(str: string, maxLength: number): string {
        if (str.length <= maxLength) {
            return str
        }
        return str.substring(0, maxLength)
    }

    /**
     * Invoke the bash command and return the result
     */
    async invoke(updates: Writable): Promise<InvokeOutput> {
        return new Promise((resolve, reject) => {
            try {
                // Spawn bash process
                const child = spawn('bash', ['-c', this.command], {
                    stdio: ['inherit', 'pipe', 'pipe'],
                    cwd: this.cwd ?? fs.getUserHomeDir(),
                })

                // Set up output buffers
                const stdoutBuffer: string[] = []
                const stderrBuffer: string[] = []

                // Create readline interfaces for stdout and stderr
                const stdoutReader = readline.createInterface({
                    input: child.stdout,
                    crlfDelay: Infinity,
                })

                const stderrReader = readline.createInterface({
                    input: child.stderr,
                    crlfDelay: Infinity,
                })

                // Handle stdout lines
                stdoutReader.on('line', (line: string) => {
                    updates.write(`${line}\n`)
                    if (stdoutBuffer.length >= LINE_COUNT) {
                        stdoutBuffer.shift()
                    }
                    stdoutBuffer.push(line)
                })

                // Handle stderr lines
                stderrReader.on('line', (line: string) => {
                    updates.write(`${line}\n`)
                    if (stderrBuffer.length >= LINE_COUNT) {
                        stderrBuffer.shift()
                    }
                    stderrBuffer.push(line)
                })

                // Handle process completion
                child.on('close', (code: number | null) => {
                    const exitStatus = code !== null ? code : 0

                    const stdout = stdoutBuffer.join('\n')
                    const stderr = stderrBuffer.join('\n')

                    const output = {
                        exit_status: exitStatus.toString(),
                        stdout: `${this.truncateSafe(stdout, MAX_TOOL_RESPONSE_SIZE / 3)}${
                            stdout.length > MAX_TOOL_RESPONSE_SIZE / 3 ? ' ... truncated' : ''
                        }`,
                        stderr: `${this.truncateSafe(stderr, MAX_TOOL_RESPONSE_SIZE / 3)}${
                            stderr.length > MAX_TOOL_RESPONSE_SIZE / 3 ? ' ... truncated' : ''
                        }`,
                    }

                    resolve({
                        output: {
                            type: 'json',
                            content: output,
                        },
                    })
                })

                // Handle errors
                child.on('error', (err) => {
                    reject(new Error(`Unable to spawn command '${this.command}': ${err.message}`))
                })
            } catch (error: any) {
                reject(new Error(`Failed to execute command: ${error.message}`))
            }
        })
    }

    /**
     * Queue description of the command to be executed
     */
    queueDescription(updates: Writable): void {
        updates.write(`I will run the following shell command: `)

        // Add a newline for longer commands
        if (this.command.length > 20) {
            updates.write('\n')
        }

        // In a real terminal environment, we would set the color to green here
        updates.write(`\x1b[32m${this.command}\x1b[0m`)
    }

    /**
     * Validate the command before execution
     */
    async validate(): Promise<void> {
        // In a real implementation, we might do some PATH checking here
        return Promise.resolve()
    }
}

// /**
//  * Handler function for bash command execution
//  *
//  * @param params Parameters for the bash command
//  * @param updates Writable stream for updates
//  * @returns The execution result
//  */
// export async function handleExecuteBash(
//     params: ExecuteBashParams,
//     updates: Writable = process.stdout
// ): Promise<InvokeOutput> {
//     const executor = new ExecuteBash(params)

//     // Validate the command
//     await executor.validate()

//     // Show command description
//     executor.queueDescription(updates)
//     updates.write('\n')

//     // Execute the command
//     return await executor.invoke(updates)
// }

// // Simple test runner
// async function runTests() {
//     console.log('Running tests for ExecuteBash...');
//     let passedTests = 0;
//     let failedTests = 0;
//
//     // Helper function to run a test
//     async function runTest(name: string, testFn: () => Promise<void>) {
//         try {
//             await testFn();
//             console.log(`✓ ${name}`);
//             passedTests++;
//         } catch (error) {
//             console.error(`✗ ${name}`);
//             console.error(`  Error: ${error}`);
//             failedTests++;
//         }
//     }
//
//     // Helper function for assertions
//     function assert(condition: boolean, message: string) {
//         if (!condition) {
//             throw new Error(message);
//         }
//     }
//
//     // Test requires_acceptance for readonly commands
//     await runTest('test_requires_acceptance_for_readonly_commands', async () => {
//         const testCases = [
//             // Safe commands
//             { command: 'ls ~', expected: false },
//             { command: 'ls -al ~', expected: false },
//             { command: 'pwd', expected: false },
//             { command: 'echo \'Hello, world!\'', expected: false },
//             { command: 'which aws', expected: false },
//
//             // Potentially dangerous readonly commands
//             { command: 'echo hi > myimportantfile', expected: true },
//             { command: 'ls -al >myimportantfile', expected: true },
//             { command: 'echo hi 2> myimportantfile', expected: true },
//             { command: 'echo hi >> myimportantfile', expected: true },
//             { command: 'echo $(rm myimportantfile)', expected: true },
//             { command: 'echo `rm myimportantfile`', expected: true },
//             { command: 'echo hello && rm myimportantfile', expected: true },
//             { command: 'echo hello&&rm myimportantfile', expected: true },
//             { command: 'ls nonexistantpath || rm myimportantfile', expected: true },
//             { command: 'echo myimportantfile | xargs rm', expected: true },
//             { command: 'echo myimportantfile|args rm', expected: true },
//             { command: 'echo <(rm myimportantfile)', expected: true },
//             { command: 'cat <<< \'some string here\' > myimportantfile', expected: true },
//             { command: 'echo \'\n#!/usr/bin/env bash\necho hello\n\' > myscript.sh', expected: true },
//             { command: 'cat <<EOF > myimportantfile\nhello world\nEOF', expected: true },
//         ];
//
//         for (const { command, expected } of testCases) {
//             const tool = new ExecuteBash({ command });
//             const actual = tool.requiresAcceptance();
//             assert(
//                 actual === expected,
//                 `Expected command '${command}' to have requires_acceptance: ${expected}, but got ${actual}`
//             );
//         }
//     });
//
//     // Test execute bash tool - stdout
//     await runTest('test_execute_bash_tool_stdout', async () => {
//         const mockOutput = new MockWritable();
//         const tool = new ExecuteBash({ command: 'echo Hello, world!' });
//         const result = await tool.invoke(mockOutput);
//
//         assert(
//             result.output.type === 'json',
//             'Expected JSON output'
//         );
//
//         if (result.output.type === 'json') {
//             const json = result.output.value;
//             assert(json.exit_status === '0', `Expected exit status 0, got ${json.exit_status}`);
//             assert(
//                 json.stdout.trim() === 'Hello, world!',
//                 `Expected stdout 'Hello, world!', got '${json.stdout.trim()}'`
//             );
//             assert(json.stderr === '', `Expected empty stderr, got '${json.stderr}'`);
//         }
//     });
//
//     // Test execute bash tool - stderr
//     await runTest('test_execute_bash_tool_stderr', async () => {
//         const mockOutput = new MockWritable();
//         const tool = new ExecuteBash({ command: 'echo Hello, world! 1>&2' });
//         const result = await tool.invoke(mockOutput);
//
//         assert(
//             result.output.type === 'json',
//             'Expected JSON output'
//         );
//
//         if (result.output.type === 'json') {
//             const json = result.output.value;
//             assert(json.exit_status === '0', `Expected exit status 0, got ${json.exit_status}`);
//             assert(json.stdout === '', `Expected empty stdout, got '${json.stdout}'`);
//             assert(
//                 json.stderr.trim() === 'Hello, world!',
//                 `Expected stderr 'Hello, world!', got '${json.stderr.trim()}'`
//             );
//         }
//     });
//
//     // Test execute bash tool - exit code
//     await runTest('test_execute_bash_tool_exit_code', async () => {
//         const mockOutput = new MockWritable();
//         const tool = new ExecuteBash({ command: 'exit 1' });
//         const result = await tool.invoke(mockOutput);
//
//         assert(
//             result.output.type === 'json',
//             'Expected JSON output'
//         );
//
//         if (result.output.type === 'json') {
//             const json = result.output.value;
//             assert(json.exit_status === '1', `Expected exit status 1, got ${json.exit_status}`);
//             assert(json.stdout === '', `Expected empty stdout, got '${json.stdout}'`);
//             assert(json.stderr === '', `Expected empty stderr, got '${json.stderr}'`);
//         }
//     });
//
//     // Test queue description
//     await runTest('test_queue_description', async () => {
//         const mockOutput = new MockWritable();
//
//         // Short command
//         const shortTool = new ExecuteBash({ command: 'ls' });
//         shortTool.queueDescription(mockOutput);
//
//         assert(
//             mockOutput.content.includes('I will run the following shell command:'),
//             'Expected description to include intro text'
//         );
//         assert(
//             mockOutput.content.includes('ls'),
//             'Expected description to include the command'
//         );
//
//         // Reset mock output
//         mockOutput.reset();
//
//         // Long command
//         const longTool = new ExecuteBash({
//             command: 'find /usr/local -type f -name "*.json" | grep -v node_modules'
//         });
//         longTool.queueDescription(mockOutput);
//
//         assert(
//             mockOutput.content.includes('I will run the following shell command:'),
//             'Expected description to include intro text'
//         );
//         assert(
//             mockOutput.content.includes('\n'),
//             'Expected description to include a newline for long command'
//         );
//         assert(
//             mockOutput.content.includes('find /usr/local -type f -name "*.json" | grep -v node_modules'),
//             'Expected description to include the command'
//         );
//     });
//
//     // Test handler function
//     await runTest('test_handle_execute_bash', async () => {
//         const mockOutput = new MockWritable();
//         const result = await handleExecuteBash({ command: 'echo "Test execution"' }, mockOutput);
//
//         assert(
//             result.output.type === 'json',
//             'Expected JSON output'
//         );
//
//         if (result.output.type === 'json') {
//             const json = result.output.value;
//             assert(json.exit_status === '0', `Expected exit status 0, got ${json.exit_status}`);
//             assert(
//                 json.stdout.trim() === 'Test execution',
//                 `Expected stdout 'Test execution', got '${json.stdout.trim()}'`
//             );
//         }
//
//         assert(
//             mockOutput.content.includes('I will run the following shell command:'),
//             'Expected output to include command description'
//         );
//         assert(
//             mockOutput.content.includes('echo "Test execution"'),
//             'Expected output to include the command'
//         );
//     });
//
//     // Print test results
//     console.log(`\nTests completed: ${passedTests + failedTests} total`);
//     console.log(`✓ ${passedTests} passed`);
//     console.log(`✗ ${failedTests} failed`);
//
//     if (failedTests > 0) {
//         process.exit(1);
//     }
// }
//
// class MockWritable extends Writable {
//     content: string = '';
//
//     _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
//         this.content += chunk.toString();
//         callback();
//     }
//
//     reset(): void {
//         this.content = '';
//     }
// }
//
// // Tests
// // Only run tests if this file is being executed directly (not imported)
// if (require.main === module) {
//     // Mock writable stream for testing
//     // Run the tests
//     runTests().catch(error => {
//         console.error('Test runner error:', error);
//         process.exit(1);
//     });
// }

export default ExecuteBash
