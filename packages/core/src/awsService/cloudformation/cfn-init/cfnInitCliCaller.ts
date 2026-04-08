/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { extractErrorMessage } from '../utils'

export interface EnvironmentOption {
    name: string
    awsProfile: string
    parametersFiles?: string[]
}

export class CfnInitCliCaller {
    private binaryPath: string

    constructor(serverRootDir: string) {
        this.binaryPath = path.join(serverRootDir, 'bin', 'cfn-init')
    }

    async createProject(
        projectName: string,
        options?: {
            projectPath?: string
            environments?: EnvironmentOption[]
        }
    ) {
        const args = ['create', projectName]

        if (options?.projectPath) {
            args.push('--project-path', options.projectPath)
        }

        if (options?.environments && options.environments.length > 0) {
            const environmentConfig = {
                environments: options.environments,
            }
            args.push('--environments', JSON.stringify(environmentConfig))
        }

        return this.executeCommand(args)
    }

    async addEnvironments(environments: EnvironmentOption[]) {
        const args = ['environment', 'add', '--environments', JSON.stringify({ environments })]
        return this.executeCommand(args)
    }

    async removeEnvironment(envName: string) {
        const args = ['environment', 'remove', envName]
        return this.executeCommand(args)
    }

    private async executeCommand(args: string[]) {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()

        try {
            const result = await ChildProcess.run(this.binaryPath, args, {
                spawnOptions: {
                    cwd,
                },
            })

            if (result.exitCode === 0) {
                return { success: true, output: result.stdout || undefined }
            } else {
                void vscode.window.showWarningMessage(
                    `cfn init command returned exit code ${result.exitCode}: ${result.stderr} - ${result.stdout} - ${extractErrorMessage(result.error)}`
                )
                return { success: false, error: result.stderr || `Process exited with code ${result.exitCode}` }
            }
        } catch (error) {
            void vscode.window.showErrorMessage(`Error executing cfn init command: ${extractErrorMessage(error)}`)
            return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
    }
}
