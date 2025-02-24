/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
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
import type { ExtensionContext } from 'vscode'
import { ToolkitError } from '../../../shared/errors'

const localize = nls.loadMessageBundle()
export interface CreateServerlessLandWizardForm {
    name: string
    location: vscode.Uri
    pattern: string
    runtime: string
    iac: string
    assetName: string
}

async function loadMetadata(ctx: vscode.ExtensionContext): Promise<MetadataManager> {
    const metadataManager = MetadataManager.getInstance()
    const metadataPath = ctx.asAbsolutePath(path.join('dist', 'src', 'serverlessLand', 'metadata.json'))
    await metadataManager.loadMetadata(metadataPath)
    return metadataManager
}

function promptPattern(metadataManager: MetadataManager) {
    const patterns = metadataManager.getPatterns()
    if (patterns.length === 0) {
        throw new ToolkitError('No patterns found in metadata')
    }

    const quickPick = createQuickPick<string>(
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
            title: localize('AWS.serverlessLand.initWizard.pattern.prompt', 'Select a Pattern for your application'),
            placeholder: 'Choose a pattern for your project',
            buttons: createCommonButtons(),
            matchOnDescription: true,
            matchOnDetail: true,
        }
    )

    return quickPick
}

function promptRuntime(metadataManager: MetadataManager, pattern: string | undefined) {
    if (!pattern || typeof pattern !== 'string') {
        throw new ToolkitError('Pattern not selected')
    }

    const runtimes = metadataManager.getRuntimes(pattern)
    if (runtimes.length === 0) {
        throw new ToolkitError('No runtimes found for the selected pattern')
    }

    return createQuickPick<string>(
        runtimes.map((r) => ({
            label: r.label,
            data: r.label,
        })),
        {
            title: localize('AWS.serverlessLand.initWizard.runtime.prompt', 'Select Runtime'),
            placeholder: 'Choose a runtime for your project',
            buttons: [vscode.QuickInputButtons.Back],
        }
    )
}

function promptIac(metadataManager: MetadataManager, pattern: string | undefined) {
    if (!pattern || typeof pattern !== 'string') {
        throw new ToolkitError('Pattern not selected')
    }

    const iacOptions = metadataManager.getIacOptions(pattern)
    if (iacOptions.length === 0) {
        throw new ToolkitError('No IAC options found for the selected pattern')
    }

    return createQuickPick<string>(
        iacOptions.map((i) => ({
            label: i.label,
            data: i.label,
        })),
        {
            title: localize('AWS.serverlessLand.initWizard.iac.prompt', 'Select IaC'),
            placeholder: 'Choose an IaC option for your project',
            buttons: [vscode.QuickInputButtons.Back],
        }
    )
}

function promptLocation() {
    return createFolderPrompt(vscode.workspace.workspaceFolders ?? [], {
        title: localize('AWS.serverlessLand.initWizard.location.prompt', 'Select Project Location'),
        buttons: [vscode.QuickInputButtons.Back],
        browseFolderDetail: 'Select a folder for your project',
    })
}

function promptName() {
    return createInputBox({
        title: localize('AWS.serverlessLand.initWizard.name.prompt', 'Enter Project Name'),
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

/**
 * Wizard for creating Serverless Land applications
 * Guides users through the project creation process
 */
export class CreateServerlessLandWizard extends Wizard<CreateServerlessLandWizardForm> {
    private metadataManager: MetadataManager

    public constructor(context: { ctx: ExtensionContext; defaultRegion?: string; credentials?: AWS.Credentials }) {
        super({
            exitPrompterProvider: createExitPrompter,
        })
        loadMetadata(context.ctx).catch((err: any) => {
            throw new ToolkitError(`Failed to load metadata: ${err}`)
        })
        this.metadataManager = MetadataManager.getInstance()
        this.form.pattern.bindPrompter(() => {
            const quickPick = promptPattern(this.metadataManager)

            return quickPick
        })
        this.form.runtime.bindPrompter((state) => promptRuntime(this.metadataManager, state.pattern))
        this.form.iac.bindPrompter((state) => promptIac(this.metadataManager, state.pattern))
        this.form.location.bindPrompter(() => promptLocation())
        this.form.name.bindPrompter(() => promptName())
    }
}
