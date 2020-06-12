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
    TemplateTargetProperties,
} from '../sam/debugger/awsSamDebugConfiguration'
import {
    AwsSamDebugConfigurationValidator,
    DefaultAwsSamDebugConfigurationValidator,
} from '../sam/debugger/awsSamDebugConfigurationValidator'
import * as pathutils from '../utilities/pathUtils'
import { tryGetAbsolutePath } from '../utilities/workspaceUtils'

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
        return _(this.configSource.getDebugConfigurations())
            .map(o => {
                if (isAwsSamDebugConfiguration(o)) {
                    ensureRelativePaths(undefined, o)
                }
                return o
            })
            .value()
    }

    /**
     * Returns all valid Sam Debug Configurations.
     */
    public getSamDebugConfigurations(): AwsSamDebuggerConfiguration[] {
        return _(this.getDebugConfigurations())
            .filter(isAwsSamDebugConfiguration)
            .filter(config => this.samValidator.validate(config)?.isValid)
            .value()
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
        await this.launch.update('configurations', value)
    }
}

function getSamTemplateTargets(launchConfig: LaunchConfiguration): TemplateTargetProperties[] {
    return _(launchConfig.getSamDebugConfigurations())
        .map(samConfig => samConfig.invokeTarget)
        .filter(isTemplateTargetProperties)
        .value()
}

function getSamCodeTargets(launchConfig: LaunchConfiguration): CodeTargetProperties[] {
    return _(launchConfig.getSamDebugConfigurations())
        .map(samConfig => samConfig.invokeTarget)
        .filter(isCodeTargetProperties)
        .value()
}

/**
 * Returns a Set containing the logicalIds from the launch.json file that the launch config is scoped to.
 * @param launchConfig Launch config to check
 */
export function getReferencedTemplateResources(launchConfig: LaunchConfiguration): Set<string> {
    const existingSamTemplateTargets = getSamTemplateTargets(launchConfig)
    const folder = launchConfig.workspaceFolder

    return _(existingSamTemplateTargets)
        .filter(target =>
            pathutils.areEqual(folder?.uri.fsPath, target.templatePath, launchConfig.scopedResource.fsPath)
        )
        .map(target => target.logicalId)
        .thru(array => new Set(array))
        .value()
}

/**
 * Returns a Set containing the full path for all `code`-type `aws-sam` debug configs in a launch.json file.
 * The full path represents `path.join(workspaceFolder, projectRoot, lambdaHandler)`
 * (without workspaceFolder if the projectRoot is relative).
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
