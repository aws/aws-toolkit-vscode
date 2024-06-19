/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash'
import * as nls from 'vscode-nls'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    AwsSamDebuggerConfiguration,
    CodeTargetProperties,
    ensureRelativePaths,
    isAwsSamDebugConfiguration,
    isCodeTargetProperties,
    isTemplateTargetProperties,
    AwsSamTargetType,
} from '../sam/debugger/awsSamDebugConfiguration'
import {
    AwsSamDebugConfigurationValidator,
    DefaultAwsSamDebugConfigurationValidator,
} from '../sam/debugger/awsSamDebugConfigurationValidator'
import * as pathutils from '../utilities/pathUtils'
import { tryGetAbsolutePath } from '../utilities/workspaceUtils'
import { getLogger } from '../logger'
import { makeFailedWriteMessage, showViewLogsMessage } from '../utilities/messages'
import { launchConfigDocUrl } from '../constants'
import { openUrl } from '../utilities/vsCodeUtils'
import globals from '../extensionGlobals'

const localize = nls.loadMessageBundle()

/**
 * Reads and writes DebugConfigurations.
 */
export interface DebugConfigurationSource {
    getDebugConfigurations(): vscode.DebugConfiguration[]
    setDebugConfigurations(value: vscode.DebugConfiguration[]): Promise<void>
}

/**
 * Wraps read and write operations on launch.json.
 */
export class LaunchConfiguration {
    public readonly workspaceFolder: vscode.WorkspaceFolder | undefined
    /**
     * Creates a Launch Configuration scoped to the given resource.
     */
    public constructor(
        public readonly scopedResource: vscode.Uri,
        private readonly configSource: DebugConfigurationSource = new DefaultDebugConfigSource(scopedResource),
        private readonly samValidator: AwsSamDebugConfigurationValidator = new DefaultAwsSamDebugConfigurationValidator(
            vscode.workspace.getWorkspaceFolder(scopedResource)
        )
    ) {
        this.workspaceFolder = vscode.workspace.getWorkspaceFolder(scopedResource)
    }

    public getDebugConfigurations(): vscode.DebugConfiguration[] {
        const configs = this.configSource.getDebugConfigurations()
        return configs.map(o => {
            if (isAwsSamDebugConfiguration(o)) {
                ensureRelativePaths(undefined, o)
            }
            return o
        })
    }

    /**
     * Returns all valid Sam Debug Configurations.
     */
    public async getSamDebugConfigurations(): Promise<AwsSamDebuggerConfiguration[]> {
        const configs = this.getDebugConfigurations().filter(o =>
            isAwsSamDebugConfiguration(o)
        ) as AwsSamDebuggerConfiguration[]
        const registry = await globals.templateRegistry
        // XXX: can't use filter() with async predicate.
        const validConfigs: AwsSamDebuggerConfiguration[] = []
        for (const c of configs) {
            if ((await this.samValidator.validate(c, registry))?.isValid) {
                validConfigs.push(c)
            }
        }
        return validConfigs
    }

    /**
     * Adds a collection of debug configurations to the top of the list
     */
    public async addDebugConfigurations(debugConfigs: vscode.DebugConfiguration[]): Promise<void> {
        await this.configSource.setDebugConfigurations([...debugConfigs, ...this.getDebugConfigurations()])
    }

    /**
     * Adds a debug configuration to the top of the list.
     */
    public async addDebugConfiguration(debugConfig: vscode.DebugConfiguration): Promise<void> {
        await this.configSource.setDebugConfigurations([debugConfig, ...this.getDebugConfigurations()])
    }

    /**
     * Edits a debug configuration at a specfic index by replacing it with a new one.
     * @param editedDebugConfig Full edited debug configuration
     * @param index Index in `launch.json` configurations to replace
     */
    public async editDebugConfiguration(editedDebugConfig: vscode.DebugConfiguration, index: number): Promise<void> {
        const configs = this.getDebugConfigurations()
        configs[index] = editedDebugConfig
        await this.configSource.setDebugConfigurations(configs)
    }
}

class DefaultDebugConfigSource implements DebugConfigurationSource {
    private readonly launch: vscode.WorkspaceConfiguration

    public constructor(resource: vscode.Uri) {
        this.launch = vscode.workspace.getConfiguration('launch', resource)
    }

    public getDebugConfigurations(): vscode.DebugConfiguration[] {
        return this.launch.get<vscode.DebugConfiguration[]>('configurations') ?? []
    }

    public async setDebugConfigurations(value: vscode.DebugConfiguration[]): Promise<void> {
        try {
            await this.launch.update('configurations', value)
        } catch (e) {
            const helpText = localize('AWS.generic.message.getHelp', 'Get Help...')
            getLogger().error('setDebugConfigurations failed: %O', e as Error)
            await showViewLogsMessage(makeFailedWriteMessage('launch.json'), 'error', [helpText]).then(
                async buttonText => {
                    if (buttonText === helpText) {
                        await openUrl(vscode.Uri.parse(launchConfigDocUrl))
                    }
                }
            )
        }
    }
}

async function getSamCodeTargets(launchConfig: LaunchConfiguration): Promise<CodeTargetProperties[]> {
    const debugConfigs = await launchConfig.getSamDebugConfigurations()
    return _(debugConfigs)
        .map(samConfig => samConfig.invokeTarget)
        .filter(isCodeTargetProperties)
        .value()
}

/**
 * Gets configs associated with the template.yaml to which `launchConfig` is
 * scoped.
 *
 * @param launchConfig Launch config to check
 * @param type  target type ('api' or 'template'), or undefined for 'both'
 */
export async function getConfigsMappedToTemplates(
    launchConfig: LaunchConfiguration,
    type: AwsSamTargetType | undefined
): Promise<Set<AwsSamDebuggerConfiguration>> {
    if (type === 'code') {
        throw Error()
    }
    const folder = launchConfig.workspaceFolder
    // Launch configs with target=template or target=api.
    const templateConfigs = (await launchConfig.getSamDebugConfigurations()).filter(o =>
        isTemplateTargetProperties(o.invokeTarget)
    )
    const filtered = templateConfigs.filter(
        t =>
            (type === undefined || t.invokeTarget.target === type) &&
            pathutils.areEqual(
                folder?.uri.fsPath,
                (t.invokeTarget as any).templatePath,
                launchConfig.scopedResource.fsPath
            )
    )
    return _(filtered)
        .thru(array => new Set(array))
        .value()
}

/**
 * Gets a set of filepaths pointing to the handler source file for each
 * `target=code` config in launch.json.
 *
 * Each path is the absolute path resolved against `projectRoot`.
 *
 * @param launchConfig Launch config to check
 */
export async function getReferencedHandlerPaths(launchConfig: LaunchConfiguration): Promise<Set<string>> {
    const existingSamCodeTargets = await getSamCodeTargets(launchConfig)

    return _(existingSamCodeTargets)
        .map(target => {
            if (path.isAbsolute(target.projectRoot)) {
                return pathutils.normalize(path.join(target.projectRoot, target.lambdaHandler))
            }
            return pathutils.normalize(
                path.join(
                    tryGetAbsolutePath(launchConfig.workspaceFolder, ''),
                    target.projectRoot,
                    target.lambdaHandler
                )
            )
        })
        .thru(array => new Set(array))
        .value()
}
