/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TemplateItem, createTemplatePrompter } from '../ui/sam/templatePrompter'
import { ChildProcess } from '../utilities/processUtils'
import { addTelemetryEnvVar } from './cli/samCliInvokerUtils'
import { Wizard } from '../wizards/wizard'
import { CloudFormationTemplateRegistry } from '../fs/templateRegistry'
import { createExitPrompter } from '../ui/common/exitPrompter'
import { DataQuickPickItem, createMultiPick, createQuickPick } from '../ui/pickerPrompter'
import { createCommonButtons } from '../ui/buttons'
import { samBuildParamUrl, samBuildUrl } from '../constants'
import { CancellationError } from '../utilities/timeoutUtils'
import { ToolkitError } from '../errors'
import globals from '../extensionGlobals'
import { TreeNode } from '../treeview/resourceTreeDataProvider'
import { telemetry } from '../telemetry/telemetry'
import { getSpawnEnv } from '../env/resolveEnv'
import {
    getErrorCode,
    getProjectRoot,
    getSamCliPathAndVersion,
    getTerminalFromError,
    isDotnetRuntime,
    updateRecentResponse,
} from './utils'
import { getConfigFileUri, validateSamBuildConfig } from './config'
import { runInTerminal } from './processTerminal'
import { SemVer } from 'semver'

const buildMementoRootKey = 'samcli.build.params'
export interface BuildParams {
    readonly template: TemplateItem
    readonly projectRoot: vscode.Uri
    readonly paramsSource: ParamsSource.Specify | ParamsSource.SamConfig | ParamsSource.DefaultValues
    readonly buildFlags?: string
}

export enum ParamsSource {
    Specify,
    SamConfig,
    DefaultValues,
}

export function createParamsSourcePrompter(existValidSamconfig: boolean) {
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
        title: 'Specify parameter source for build',
        placeholder: 'Select configuration options for sam build',
        buttons: createCommonButtons(samBuildUrl),
    })
}

const buildFlagItems: DataQuickPickItem<string>[] = [
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
        if (this.arg === undefined) {
            // "Build" command was invoked on the command palette.
            this.form.template.bindPrompter(() =>
                createTemplatePrompter(this.registry, buildMementoRootKey, samBuildUrl)
            )
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await validateSamBuildConfig(projectRoot)
                return createParamsSourcePrompter(existValidSamConfig)
            })
        } else {
            // "Build" command was invoked from build icon from sidebar
            const templateUri = (this.arg.getTreeItem() as vscode.TreeItem).resourceUri
            const templateItem = { uri: templateUri, data: {} } as TemplateItem
            this.form.template.setDefault(templateItem)
            this.form.projectRoot.setDefault(({ template }) => getProjectRoot(template))
            this.form.paramsSource.bindPrompter(async ({ projectRoot }) => {
                const existValidSamConfig: boolean | undefined = await validateSamBuildConfig(projectRoot)
                return createParamsSourcePrompter(existValidSamConfig)
            })
            this.form.projectRoot.setDefault(() => getProjectRoot(templateItem))
        }

        this.form.buildFlags.bindPrompter(
            () =>
                createMultiPick(buildFlagItems, {
                    title: 'Select build flags',
                    buttons: createCommonButtons(samBuildParamUrl),
                    ignoreFocusOut: true,
                }),
            {
                showWhen: ({ paramsSource }) => paramsSource === ParamsSource.Specify,
            }
        )
    }
}

/**
 * Get build flags based on user selection
 * @param paramsSource
 * @param projectRoot
 * @param defaultFlags
 * @returns
 */
export async function getBuildFlags(
    paramsSource: ParamsSource,
    projectRoot: vscode.Uri,
    defaultFlags: string[]
): Promise<string[]> {
    if (paramsSource === ParamsSource.SamConfig) {
        try {
            const samConfigFile = await getConfigFileUri(projectRoot)
            return ['--config-file', samConfigFile.fsPath]
        } catch (error) {
            return defaultFlags
        }
    }
    return defaultFlags
}

export async function runBuild(arg?: TreeNode): Promise<SamBuildResult> {
    const source = arg ? 'AppBuilderBuild' : 'CommandPalette'
    telemetry.record({ source: source })

    // Prepare Build params
    const buildParams: Partial<BuildParams> = {}

    const registry = await globals.templateRegistry
    const params = await new BuildWizard(buildParams, registry, arg).run()
    if (params === undefined) {
        throw new CancellationError('user')
    }

    const projectRoot = params.projectRoot

    const defaultFlags: string[] = ['--cached', '--parallel', '--save-params', '--use-container']

    const { path: samCliPath, parsedVersion } = await getSamCliPathAndVersion()

    // refactor
    const buildFlags: string[] =
        params.paramsSource === ParamsSource.Specify && params.buildFlags
            ? await resolveBuildFlags(JSON.parse(params.buildFlags), parsedVersion)
            : await getBuildFlags(params.paramsSource, projectRoot, defaultFlags)

    // todo remove
    if (await isDotnetRuntime(params.template.uri)) {
        if (buildFlags.includes('--use-container')) {
            buildFlags.push('--mount-with', 'WRITE')
        }
    }

    const templatePath = params.template.uri.fsPath
    buildFlags.push('--template', `${templatePath}`)

    await updateRecentResponse(buildMementoRootKey, 'global', 'templatePath', templatePath)

    try {
        // Create a child process to run the SAM build command
        const buildProcess = new ChildProcess(samCliPath, ['build', ...buildFlags], {
            spawnOptions: await addTelemetryEnvVar({
                cwd: params.projectRoot.fsPath,
                env: await getSpawnEnv(process.env),
            }),
        })

        // Run SAM build in Terminal
        await runInTerminal(buildProcess, 'build')

        return {
            isSuccess: true,
        }
    } catch (error) {
        throw ToolkitError.chain(error, 'Failed to build SAM template', {
            details: { terminal: getTerminalFromError(error), ...resolveBuildArgConflict(buildFlags) },
            code: getErrorCode(error),
        })
    }
}

function resolveBuildArgConflict(boundArgs: string[]): string[] {
    const boundArgsSet = new Set(boundArgs)
    if (boundArgsSet.has('--watch')) {
        boundArgsSet.delete('--no-watch')
    }
    if (boundArgsSet.has('--dependency-layer')) {
        boundArgsSet.delete('--no--dependency-layer')
    }
    if (boundArgsSet.has('--use-container') || boundArgsSet.has('-u')) {
        boundArgsSet.delete('--build-in-source')
    }
    if (boundArgsSet.has('--build-in-source')) {
        boundArgsSet.delete('--no-build-in-source')
    }

    // TODO phase 2: add anti param
    // apply anti param if param is not set
    // if (!boundArgsSet.has('--cached')) {
    //     boundArgsSet.add('--no-cached')
    // }
    // if (!boundArgsSet.has('--build-in-source')) {
    //     boundArgsSet.add('--no-build-in-source')
    // }
    // if (!boundArgsSet.has('--beta-features')) {
    //     boundArgsSet.add('--no-beta-features')
    // }
    return Array.from(boundArgsSet)
}
export async function resolveBuildFlags(buildFlags: string[], samCliVersion: SemVer | null): Promise<string[]> {
    // --no-use-container was not added until v1.133.0
    if (samCliVersion?.compare('1.133.0') ?? -1 < 0) {
        return buildFlags
    }
    if (!buildFlags.includes('--use-container')) {
        buildFlags.push('--no-use-container')
    }
    return buildFlags
}
