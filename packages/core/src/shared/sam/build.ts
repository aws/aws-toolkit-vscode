/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TemplateItem, createTemplatePrompter, getSamCliPathAndVersion, runInTerminal } from './sync'
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
import { Metric, SamBuild, telemetry } from '../telemetry/telemetry'
import { getProjectRootUri, isDotnetRuntime } from './utils'
import { SamConfig } from './config'

export interface BuildParams {
    readonly template: TemplateItem
    readonly projectRoot: vscode.Uri
    readonly paramsSource: ParamsSource.Specify | ParamsSource.SamConfig | ParamsSource.DefaultValues
}

enum ParamsSource {
    Specify,
    SamConfig,
    DefaultValues,
}

function createParamsSourcePrompter(existValidSamconfig: boolean) {
    const items: DataQuickPickItem<ParamsSource>[] = [
        {
            label: 'Specify build flags',
            data: ParamsSource.Specify,
        },
    ]

    items.push(
        existValidSamconfig
            ? {
                  label: 'Use default values from samconfig',
                  data: ParamsSource.SamConfig,
              }
            : {
                  label: 'Use default values',
                  data: ParamsSource.DefaultValues,
                  description: 'cached = true, parallel = true, use_container = true',
              }
    )

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
    arg: TreeNode<unknown> | undefined
    registry: CloudFormationTemplateRegistry
    public constructor(
        state: Partial<BuildParams>,
        registry: CloudFormationTemplateRegistry,
        arg?: TreeNode | undefined
    ) {
        super({ initState: state, exitPrompterProvider: createExitPrompter })
        this.registry = registry
        this.arg = arg
    }

    public override async init(): Promise<this> {
        const getProjectRoot = (template: TemplateItem | undefined) =>
            template ? getProjectRootUri(template.uri) : undefined

        if (this.arg === undefined) {
            // "Build" command was invoked on the command palette.
            this.form.template.bindPrompter(() => createTemplatePrompter(this.registry))
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await SamConfig.validateSamBuildConfig(projectRoot)
                return createParamsSourcePrompter(existValidSamConfig)
            })
        } else {
            // "Build" command was invoked from build icon from sidebar
            const templateUri = (this.arg.getTreeItem() as vscode.TreeItem).resourceUri
            const templateItem = { uri: templateUri, data: {} } as TemplateItem
            this.form.template.setDefault(templateItem)
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await SamConfig.validateSamBuildConfig(projectRoot)
                return createParamsSourcePrompter(existValidSamConfig)
            })
            this.form.projectRoot.setDefault(() => getProjectRoot(templateItem))
        }
        return this
    }
}

/**
 * Get build flags based on user selection
 * @param paramsSource
 * @param projectRoot
 * @param defaultFlags
 * @returns
 */
async function getBuildFlags(
    paramsSource: ParamsSource,
    projectRoot: vscode.Uri,
    defaultFlags: string[]
): Promise<string[]> {
    switch (paramsSource) {
        case ParamsSource.Specify:
            // eslint-disable-next-line no-case-declarations
            const flagItems = await buildFlagsPrompter()
            if (flagItems === undefined) {
                throw new CancellationError('user')
            }
            return flagItems ? flagItems.map((item) => item.data as string) : defaultFlags

        case ParamsSource.SamConfig:
            try {
                const samConfigFile = await SamConfig.getConfigFileUri(projectRoot)
                return ['--config-file', samConfigFile.fsPath]
            } catch (error) {
                return defaultFlags
            }

        default:
            return defaultFlags
    }
}

export function registerBuild() {
    async function runBuild(span: Metric<SamBuild>, arg?: TreeNode): Promise<SamBuildResult> {
        const source = arg ? 'AppBuilderBuild' : 'CommandPalette'
        span.record({ source: source })

        // Prepare Build params
        const buildParams: Partial<BuildParams> = {}

        const registry = await globals.templateRegistry
        const params = await new BuildWizard(buildParams, registry, arg).run()
        if (params === undefined) {
            throw new CancellationError('user')
        }

        const projectRoot = params.projectRoot

        const defaultFlags: string[] = ['--cached', '--parallel', '--save-params', '--use-container']
        const buildFlags: string[] = await getBuildFlags(params.paramsSource, projectRoot, defaultFlags)

        if (await isDotnetRuntime(params.template.uri)) {
            buildFlags.push('--mount-with', 'WRITE')
            if (!buildFlags.includes('--use-container')) {
                buildFlags.push('--use-container')
            }
        }

        const templatePath = params.template.uri.fsPath
        buildFlags.push('--template', `${templatePath}`)

        try {
            const { path: samCliPath } = await getSamCliPathAndVersion()

            // Create a child process to run the SAM build command
            const buildProcess = new ChildProcess(samCliPath, ['build', ...buildFlags], {
                spawnOptions: await addTelemetryEnvVar({
                    cwd: params.projectRoot.fsPath,
                    env: process.env,
                }),
            })

            //Run SAM build in Terminal
            await runInTerminal(buildProcess, 'build')

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
        async (arg?: TreeNode | undefined) => await telemetry.sam_build.run(async (span) => await runBuild(span, arg))
    )
}
