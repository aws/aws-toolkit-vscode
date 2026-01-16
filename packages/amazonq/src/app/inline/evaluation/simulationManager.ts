/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { DevSettings, getLogger } from 'aws-core-vscode/shared'
import { InlineCompletionManager } from '../completion'
import { SessionManager } from '../sessionManager'
import { EvaluationProcess } from './eval'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'

const homeDir = os.homedir()
const simulationOutputFolderPath = path.join(homeDir, 'desktop')

export class SimulationManager {
    private log = getLogger('inline')
    private static instance: SimulationManager

    private constructor() {}
    public static getInstance(): SimulationManager {
        if (!SimulationManager.instance) {
            SimulationManager.instance = new SimulationManager()
        }
        return SimulationManager.instance
    }

    async runSimulation(sessionManager: SessionManager, inlineManager: InlineCompletionManager) {
        try {
            const defaultConfig = AuthUtil.instance.regionProfileManager.clientConfig
            const config = DevSettings.instance.getServiceConfig('codewhispererService', defaultConfig)
            this.log.info(config.simulationInput)

            const inputPath = config.simulationInput
            const outputPath = config.simulationOutput.length > 0 ? config.simulationOutput : this.defaultOutputPath()

            if (!inputPath || !outputPath) {
                return
            }
            // TODO: validate inputPath and outputPath first before running
            const p = new EvaluationProcess(sessionManager, inlineManager, inputPath, outputPath)
            await p.run()
        } catch (e) {
            this.log.error('Failed to run simulation: ', e)
        }
    }

    private defaultOutputPath(): string {
        function workspaceFolder(): string | undefined {
            // get vscode worksapce folder
            const wfs = vscode.workspace.workspaceFolders
            if (wfs && wfs.length > 0) {
                const uri = wfs[0].uri
                return vscode.workspace.getWorkspaceFolder(uri)?.uri?.fsPath
            }

            return undefined
        }
        const date = new Date().toISOString()
        const parentFolder = workspaceFolder() ?? simulationOutputFolderPath
        const output = path.join(parentFolder, `simulation_result_${date}.jsonl`)
        return output
    }
}
