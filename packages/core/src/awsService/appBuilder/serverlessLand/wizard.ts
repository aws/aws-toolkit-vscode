/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as AWS from '@aws-sdk/types'
import * as vscode from 'vscode'
import { Wizard } from '../../../shared/wizards/wizard'
import * as path from 'path'
import { createInputBox } from '../../../shared/ui/inputPrompter'
import { createCommonButtons } from '../../../shared/ui/buttons'
import { createQuickPick } from '../../../shared/ui/pickerPrompter'
import { createFolderPrompt } from '../../../shared/ui/common/location'
import { createExitPrompter } from '../../../shared/ui/common/exitPrompter'
import { MetadataManager } from './metadataManager'
import { ToolkitError } from '../../../shared/errors'

export interface CreateServerlessLandWizardForm {
    name: string
    location: vscode.Uri
    pattern: string
    runtime: string
    iac: string
}

/**
 * Wizard for creating Serverless Land applications
 * Guides users through the project creation process
 */
export class CreateServerlessLandWizard extends Wizard<CreateServerlessLandWizardForm> {
    private metadataManager: MetadataManager

    public constructor(context: { defaultRegion?: string; credentials?: AWS.Credentials }) {
        super({
            exitPrompterProvider: createExitPrompter,
        })
        this.metadataManager = MetadataManager.getInstance()
    }

    public override async run(): Promise<CreateServerlessLandWizardForm | undefined> {
        try {
            // Load metadata from JSON file
            const projectRoot = path.resolve(__dirname, '../../../../../')
            const metadataPath = path.join(
                projectRoot,
                'src',
                'awsService',
                'appBuilder',
                'serverlessLand',
                'metadata.json'
            )
            await this.metadataManager.loadMetadata(metadataPath)

            // Initialize and display pattern selection
            const patterns = this.metadataManager.getPatterns()
            if (patterns.length === 0) {
                throw new ToolkitError('No patterns found in metadata')
            }

            const patternPicker = createQuickPick<string>(
                patterns.map((p) => ({
                    label: p.label,
                    detail: p.description,
                    data: p.label,
                    buttons: [
                        {
                            iconPath: new vscode.ThemeIcon('github'),
                            tooltip: 'Open in GitHub',
                        },
                        {
                            iconPath: new vscode.ThemeIcon('open-preview'),
                            tooltip: 'Open in Serverless Land',
                        },
                    ],
                })),
                {
                    title: 'Select a Pattern for your application',
                    placeholder: 'Choose a pattern for your project',
                    buttons: createCommonButtons(),
                    matchOnDescription: true,
                    matchOnDetail: true,
                }
            )

            const patternResult = await patternPicker.prompt()
            if (!patternResult || typeof patternResult !== 'string') {
                return undefined // User cancelled or invalid result
            }
            const selectedPattern = patternResult

            // Show runtime options based on selected pattern
            const runtimes = this.metadataManager.getRuntimes(selectedPattern)
            if (runtimes.length === 0) {
                throw new ToolkitError('No runtimes found for the selected pattern')
            }

            const runtimePicker = createQuickPick<string>(
                runtimes.map((r) => ({
                    label: r.label,
                    data: r.label,
                })),
                {
                    title: 'Select Runtime',
                    placeholder: 'Choose a runtime for your project',
                    buttons: createCommonButtons(),
                }
            )
            const runtimeResult = await runtimePicker.prompt()
            if (!runtimeResult || typeof runtimeResult !== 'string') {
                return undefined // User cancelled or invalid result
            }
            const selectedRuntime = runtimeResult

            // Show IAC options based on selected pattern
            const iacOptions = this.metadataManager.getIacOptions(selectedPattern)
            if (iacOptions.length === 0) {
                throw new ToolkitError('No IAC options found for the selected pattern')
            }

            const iacPicker = createQuickPick<string>(
                iacOptions.map((i) => ({
                    label: i.label,
                    data: i.label,
                })),
                {
                    title: 'Select IaC',
                    placeholder: 'Choose an IaC option for your project',
                    buttons: createCommonButtons(),
                }
            )
            const iacResult = await iacPicker.prompt()
            if (!iacResult || typeof iacResult !== 'string') {
                return undefined // User cancelled or invalid result
            }
            const selectedIac = iacResult

            // Create and show location picker
            const locationPicker = createFolderPrompt(vscode.workspace.workspaceFolders ?? [], {
                title: 'Select Project Location',
                buttons: createCommonButtons(),
                browseFolderDetail: 'Select a folder for your project',
            })

            const selectedLocation = await locationPicker.prompt()
            if (!selectedLocation || !(selectedLocation instanceof vscode.Uri)) {
                return undefined // User cancelled or invalid result
            }

            // Create and show project name input
            const nameInput = createInputBox({
                title: 'Enter Project Name',
                placeholder: 'Enter a name for your new application',
                buttons: createCommonButtons(),
                validateInput: (value: string): string | undefined => {
                    if (!value) {
                        return 'Application name cannot be empty'
                    }
                    if (value.includes(path.sep)) {
                        return `The path separator (${path.sep}) is not allowed in application names`
                    }
                    return undefined
                },
            })

            const projectName = await nameInput.prompt()
            if (!projectName || typeof projectName !== 'string') {
                return undefined // User cancelled
            }

            // Return the form with all collected values
            return {
                name: projectName,
                location: selectedLocation,
                pattern: selectedPattern,
                runtime: selectedRuntime,
                iac: selectedIac,
            }
        } catch (err) {
            throw new ToolkitError(`Failed to run wizard: ${err instanceof Error ? err.message : String(err)}`)
        }
    }
}
