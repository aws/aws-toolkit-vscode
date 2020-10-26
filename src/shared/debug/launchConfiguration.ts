/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as path from 'path'
import * as vscode from 'vscode'
import { CloudFormationTemplateRegistry } from '../cloudformation/templateRegistry'
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
import * as window from '../../shared/vscode/window'
import { makeFailedWriteMessage } from '../utilities/messages'

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
            CloudFormationTemplateRegistry.getRegistry(),
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
    public getSamDebugConfigurations(): AwsSamDebuggerConfiguration[] {
        const configs = this.getDebugConfigurations().filter(o =>
            isAwsSamDebugConfiguration(o)
        ) as AwsSamDebuggerConfiguration[]
        return configs.filter(o => this.samValidator.validate(o)?.isValid)
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
            getLogger().error('setDebugConfigurations failed: %O', e as Error)
            window.Window.vscode().showErrorMessage(makeFailedWriteMessage('launch.json'))
        }
    }
}

function getSamCodeTargets(launchConfig: LaunchConfiguration): CodeTargetProperties[] {
    return _(launchConfig.getSamDebugConfigurations())
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
export function getConfigsMappedToTemplates(
    launchConfig: LaunchConfiguration,
    type: AwsSamTargetType | undefined
): Set<AwsSamDebuggerConfiguration> {
    if (type === 'code') {
        throw Error()
    }
    const folder = launchConfig.workspaceFolder
    // Launch configs with target=template or target=api.
    const templateConfigs = launchConfig
        .getSamDebugConfigurations()
        .filter(o => isTemplateTargetProperties(o.invokeTarget))
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
export function getReferencedHandlerPaths(launchConfig: LaunchConfiguration): Set<string> {
    const existingSamCodeTargets = getSamCodeTargets(launchConfig)

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
