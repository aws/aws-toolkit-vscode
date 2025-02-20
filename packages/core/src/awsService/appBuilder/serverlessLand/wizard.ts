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
import { MetadataManager } from './metadataManager'
import { ToolkitError } from '../../../shared/errors'

export interface CreateServerlessLandWizardForm {
    name: string
    location: vscode.Uri
    pattern: string
    runtime: string
    iac: string
    assetName: string
}

/**
 * Wizard for creating Serverless Land applications
 * Guides users through the project creation process
 */
export class CreateServerlessLandWizard extends Wizard<CreateServerlessLandWizardForm> {
    private metadataManager: MetadataManager

    public constructor(context: { defaultRegion?: string; credentials?: AWS.Credentials }) {
        super()
        this.metadataManager = MetadataManager.getInstance()

        // Bind the steps
        this.form.pattern.bindPrompter(() => this.promptPattern())
        this.form.runtime.bindPrompter((state) => this.promptRuntime(state.pattern))
        this.form.iac.bindPrompter((state) => this.promptIac(state.pattern))
        this.form.location.bindPrompter(() => this.promptLocation())
        this.form.name.bindPrompter(() => this.promptName())
    }

    private async loadMetadata(): Promise<void> {
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
    }

    private async promptPattern() {
        const patterns = this.metadataManager.getPatterns()
        if (patterns.length === 0) {
            throw new Error('No patterns found in metadata')
        }

        return createQuickPick<string>(
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
    }

    private async promptRuntime(pattern: string | undefined) {
        if (!pattern || typeof pattern !== 'string') {
            throw new Error('Pattern not selected')
        }

        const runtimes = this.metadataManager.getRuntimes(pattern)
        if (runtimes.length === 0) {
            throw new Error('No runtimes found for the selected pattern')
        }

        return createQuickPick<string>(
            runtimes.map((r) => ({
                label: r.label,
                data: r.label,
            })),
            {
                title: 'Select Runtime',
                placeholder: 'Choose a runtime for your project',
                buttons: [vscode.QuickInputButtons.Back],
            }
        )
    }

    private async promptIac(pattern: string | undefined) {
        if (!pattern || typeof pattern !== 'string') {
            throw new Error('Pattern not selected')
        }

        const iacOptions = this.metadataManager.getIacOptions(pattern)
        if (iacOptions.length === 0) {
            throw new Error('No IAC options found for the selected pattern')
        }

        return createQuickPick<string>(
            iacOptions.map((i) => ({
                label: i.label,
                data: i.label,
            })),
            {
                title: 'Select IaC',
                placeholder: 'Choose an IaC option for your project',
                buttons: [vscode.QuickInputButtons.Back],
            }
        )
    }

    private async promptLocation() {
        return createFolderPrompt(vscode.workspace.workspaceFolders ?? [], {
            title: 'Select Project Location',
            buttons: [vscode.QuickInputButtons.Back],
            browseFolderDetail: 'Select a folder for your project',
        })
    }

    private async promptName() {
        return createInputBox({
            title: 'Enter Project Name',
            placeholder: 'Enter a name for your new application',
            buttons: [vscode.QuickInputButtons.Back],
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
    }

    public override async run(): Promise<CreateServerlessLandWizardForm | undefined> {
        try {
            await this.loadMetadata()
            const form = await super.run()
            if (!form) {
                return undefined
            }

            return {
                ...form,
                assetName: this.metadataManager.getAssetName(form.pattern, form.runtime, form.iac),
            }
        } catch (err) {
            throw new ToolkitError(`Failed to run wizard: ${err instanceof Error ? err.message : String(err)}`)
        }
    }
}
