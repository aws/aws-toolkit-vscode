/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TemplateItem, createTemplatePrompter, getSamCliPathAndVersion, getWorkspaceUri, runInTerminal } from './sync'
import { Commands } from '../vscode/commands2'
import { ChildProcess } from '../utilities/childProcess'
import { addTelemetryEnvVar } from './cli/samCliInvokerUtils'
import { Wizard } from '../wizards/wizard'
import { CloudFormationTemplateRegistry } from '../fs/templateRegistry'
import { createExitPrompter } from '../ui/common/exitPrompter'
import { DataQuickPickItem, createQuickPick } from '../ui/pickerPrompter'
import { createBackButton, createCommonButtons, createExitButton } from '../ui/buttons'
import { samBuildUrl } from '../constants'
import { CancellationError } from '../utilities/timeoutUtils'
import { ToolkitError } from '../errors'
import globals from '../extensionGlobals'
import { TreeNode } from '../treeview/resourceTreeDataProvider'

export interface BuildParams {
    readonly template: TemplateItem
    readonly projectRoot: vscode.Uri
    readonly paramsSource: ParamsSource.Specify | ParamsSource.Samconfig
}

enum ParamsSource {
    Specify,
    Samconfig,
}

function createParamsSourcePrompter() {
    const items: DataQuickPickItem<ParamsSource>[] = [
        {
            label: 'Specify build flags',
            data: ParamsSource.Specify,
        },
        {
            label: 'Use default values from samconfig',
            data: ParamsSource.Samconfig,
            description: 'cached = true, parallel = true, use_container = true',
        },
    ]

    return createQuickPick(items, {
        title: 'Specify parameters for build',
        placeholder: 'Select configuration options for sam build',
        buttons: createCommonButtons(samBuildUrl),
    })
}

async function buildFlagsPrompter(): Promise<DataQuickPickItem<string>[] | undefined> {
    const items: DataQuickPickItem<string>[] = [
        {
            label: 'Beta features',
            data: '--beta-features',
            description: 'Enable beta features',
        },
        {
            label: 'Build in source',
            data: '--build-in-source',
            description: 'Opts in to build project in the source folder',
        },
        {
            label: 'Cached',
            data: '--cached',
            description: 'Reuse build artifacts that have not changed from previous builds',
        },
        {
            label: 'Debug',
            data: '--debug',
            description: 'Turn on debug logging to print debug messages and display timestamps',
        },
        {
            label: 'Parallel',
            data: '--parallel',
            description: 'Enable parallel builds for AWS SAM template functions and layers',
        },
        {
            label: 'Skip prepare infra',
            data: '--skip-prepare-infra',
            description: 'Skip preparation stage when there are no infrastructure changes',
        },
        {
            label: 'Skip pull image',
            data: '--skip-pull-image',
            description: 'Skip pulling down the latest Docker image for Lambda runtime',
        },
        {
            label: 'Use container',
            data: '--use-container',
            description: 'Build functions with an AWS Lambda-like container',
        },
        {
            label: 'Save parameters',
            data: '--save-params',
            description: 'Save to samconfig.toml as default parameters',
        },
    ]
    const quickPick = vscode.window.createQuickPick<DataQuickPickItem<string>>()
    quickPick.title = 'Select build flags'
    quickPick.items = items
    quickPick.canSelectMany = true
    quickPick.step = 3
    quickPick.buttons = [createBackButton(), createExitButton()]

    return new Promise((resolve) => {
        quickPick.onDidAccept(() => {
            resolve(quickPick.selectedItems.map((item) => item))
            quickPick.hide()
        })

        quickPick.onDidHide(() => {
            resolve(undefined)
            quickPick.dispose()
        })

        quickPick.show()
    })
}
export type SamBuildResult = {
    isSuccess: boolean
}

export class BuildWizard extends Wizard<BuildParams> {
    public constructor(
        state: Partial<BuildParams>,
        registry: CloudFormationTemplateRegistry,
        arg?: TreeNode | undefined
    ) {
        super({ initState: state, exitPrompterProvider: createExitPrompter })

        const getProjectRoot = (template: TemplateItem | undefined) =>
            template ? getWorkspaceUri(template) : undefined

        if (arg === undefined) {
            this.form.template.bindPrompter(() => createTemplatePrompter(registry))
            this.form.paramsSource.bindPrompter(() => createParamsSourcePrompter())
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
        } else {
            const templateUri = (arg.getTreeItem() as vscode.TreeItem).resourceUri
            const templateItem = { uri: templateUri, data: {} } as TemplateItem
            this.form.template.setDefault(templateItem)
            this.form.paramsSource.bindPrompter(() => createParamsSourcePrompter())
            this.form.projectRoot.setDefault(() => getProjectRoot(templateItem))
        }
    }
}

export function registerBuild() {
    async function runBuild(arg?: TreeNode): Promise<SamBuildResult> {
        // Prepare Build params
        const buildParams: Partial<BuildParams> = {}

        const registry = await globals.templateRegistry
        const params = await new BuildWizard(buildParams, registry, arg).run()
        if (params === undefined) {
            throw new CancellationError('user')
        }

        const projectRoot = params.projectRoot

        let buildFlags: string[] = []
        const defaultFlags: string[] = ['--cached', '--parallel', '--save-params']

        if (params.paramsSource === ParamsSource.Specify) {
            const flagItems = await buildFlagsPrompter()
            if (flagItems) {
                flagItems.forEach((item) => {
                    buildFlags.push(item.data as string)
                })
            } else {
                buildFlags = defaultFlags
            }
        } else {
            // Get samconfig.toml file Uri
            const samConfigFilename = 'samconfig'
            const samConfigFile = (
                await vscode.workspace.findFiles(new vscode.RelativePattern(projectRoot, `**/${samConfigFilename}.*`))
            )[0]
            if (samConfigFile) {
                buildFlags.push('--config-file', `${samConfigFile.fsPath}`)
            } else {
                buildFlags === defaultFlags
            }
        }

        const templatePath = params.template.uri.fsPath
        buildFlags.push('--template', `${templatePath}`)

        try {
            const { path: samCliPath } = await getSamCliPathAndVersion()

            // Create a child process to run the SAM build command
            const process = new ChildProcess(samCliPath, ['build', ...buildFlags], {
                spawnOptions: await addTelemetryEnvVar({
                    cwd: params.projectRoot.fsPath,
                }),
            })

            //Run SAM build in Terminal
            await runInTerminal(process, 'build')

            return {
                isSuccess: true,
            }
        } catch (error) {
            throw ToolkitError.chain(error, 'Failed to build SAM template', { details: { ...buildFlags } })
        }
    }

    Commands.register(
        {
            id: 'aws.appBuilder.build',
            autoconnect: false,
        },
        async (arg?: TreeNode | undefined) => {
            await runBuild(arg)
        }
    )
}
