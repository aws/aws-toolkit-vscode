/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'
import { CloudFormation } from './cloudformation'
import * as pathutils from '../utilities/pathUtils'
import * as path from 'path'
import { isInDirectory } from '../filesystemUtilities'
import { dotNetRuntimes } from '../../lambda/models/samLambdaRuntime'
import { getLambdaDetails } from '../../lambda/utils'
import { ext } from '../extensionGlobals'

export interface TemplateDatum {
    path: string
    template: CloudFormation.Template
}

export class CloudFormationTemplateRegistry implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private _isDisposed: boolean = false
    private readonly globs: vscode.GlobPattern[] = []
    private readonly excludedFilePatterns: RegExp[] = []
    private readonly templateRegistryData: Map<string, CloudFormation.Template> = new Map<
        string,
        CloudFormation.Template
    >()

    public constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.rebuildRegistry()
            })
        )
    }

    /**
     * Adds a glob pattern to use for lookups and resets the registry to use it.
     * Added templates cannot be removed without restarting the extension.
     * Throws an error if this manager has already been disposed.
     * @param glob vscode.GlobPattern to be used for lookups
     */
    public async addTemplateGlob(glob: vscode.GlobPattern): Promise<void> {
        if (this._isDisposed) {
            throw new Error('Manager has already been disposed!')
        }
        this.globs.push(glob)

        const watcher = vscode.workspace.createFileSystemWatcher(glob)
        this.addWatcher(watcher)

        await this.rebuildRegistry()
    }

    /**
     * Adds a regex pattern to ignore paths containing the pattern
     */
    public async addExcludedPattern(pattern: RegExp): Promise<void> {
        if (this._isDisposed) {
            throw new Error('Manager has already been disposed!')
        }
        this.excludedFilePatterns.push(pattern)

        await this.rebuildRegistry()
    }

    /**
     * Adds template to registry. Wipes any existing template in its place with newly-parsed copy of the data.
     * @param templateUri vscode.Uri containing the template to load in
     */
    public async addTemplateToRegistry(templateUri: vscode.Uri, quiet?: boolean): Promise<void> {
        const excluded = this.excludedFilePatterns.find(pattern => templateUri.fsPath.match(pattern))
        if (excluded) {
            getLogger().verbose(
                `Manager did not add template ${templateUri.fsPath} matching excluded pattern ${excluded}`
            )
            return
        }
        const pathAsString = pathutils.normalize(templateUri.fsPath)
        this.assertAbsolute(pathAsString)
        try {
            const template = await CloudFormation.load(pathAsString)
            this.templateRegistryData.set(pathAsString, template)
        } catch (e) {
            if (!quiet) {
                throw e
            }
            getLogger().verbose(`Template ${templateUri} is malformed: ${e}`)
        }
    }

    /**
     * Get a specific template's data
     * @param path Path to template of interest
     */
    public getRegisteredTemplate(path: string): TemplateDatum | undefined {
        const normalizedPath = pathutils.normalize(path)
        this.assertAbsolute(normalizedPath)
        const template = this.templateRegistryData.get(normalizedPath)
        if (template) {
            return {
                path: normalizedPath,
                template: template,
            }
        }
    }

    /**
     * Returns the registry's data as an array of TemplateData objects
     */
    public get registeredTemplates(): TemplateDatum[] {
        const arr: TemplateDatum[] = []

        for (const templatePath of this.templateRegistryData.keys()) {
            const template = this.getRegisteredTemplate(templatePath)
            if (template) {
                arr.push(template)
            }
        }

        return arr
    }

    /**
     * Removes a template from the registry.
     * @param templateUri vscode.Uri containing template to remove
     */
    public removeTemplateFromRegistry(templateUri: vscode.Uri): void {
        const pathAsString = pathutils.normalize(templateUri.fsPath)
        this.assertAbsolute(pathAsString)
        this.templateRegistryData.delete(pathAsString)
    }

    /**
     * Disposes CloudFormationTemplateRegistryManager and marks as disposed.
     */
    public dispose(): void {
        if (!this._isDisposed) {
            while (this.disposables.length > 0) {
                const disposable = this.disposables.pop()
                if (disposable) {
                    disposable.dispose()
                }
            }
            this._isDisposed = true
        }
    }

    /**
     * Rebuilds registry using current glob and exclusion patterns.
     * All functionality is currently internal to class, but can be made public if we want a manual "refresh" button
     */
    private async rebuildRegistry(): Promise<void> {
        this.reset()
        for (const glob of this.globs) {
            const templateUris = await vscode.workspace.findFiles(glob)
            for (const template of templateUris) {
                await this.addTemplateToRegistry(template, true)
            }
        }
    }

    /**
     * Removes all templates from the registry.
     */
    public reset() {
        this.templateRegistryData.clear()
    }

    /**
     * Sets watcher functionality and adds to this.disposables
     * @param watcher vscode.FileSystemWatcher
     */
    private addWatcher(watcher: vscode.FileSystemWatcher): void {
        this.disposables.push(
            watcher,
            watcher.onDidChange(async uri => {
                getLogger().verbose(`Manager detected a change to template file: ${uri.fsPath}`)
                await this.addTemplateToRegistry(uri)
            }),
            watcher.onDidCreate(async uri => {
                getLogger().verbose(`Manager detected a new template file: ${uri.fsPath}`)
                await this.addTemplateToRegistry(uri)
            }),
            watcher.onDidDelete(async uri => {
                getLogger().verbose(`Manager detected a deleted template file: ${uri.fsPath}`)
                this.removeTemplateFromRegistry(uri)
            })
        )
    }

    private assertAbsolute(p: string) {
        if (!path.isAbsolute(p)) {
            throw Error(`CloudFormationTemplateRegistry: path is relative: ${p}`)
        }
    }
}

/**
 * Gets resources and additional metadata for resources tied to a filepath and handler.
 * Checks all registered templates by default; otherwise can operate on a subset TemplateDatum[]
 * @param filepath Handler file's path
 * @param handler Handler function from aforementioned file
 * @param unfilteredTemplates Array containing TemplateDatum objects to filter
 */
export function getResourcesForHandler(
    filepath: string,
    handler: string,
    unfilteredTemplates: TemplateDatum[] = ext.templateRegistry.registeredTemplates
): { templateDatum: TemplateDatum; name: string; resourceData: CloudFormation.Resource }[] {
    // TODO: Array.flat and Array.flatMap not introduced until >= Node11.x -- migrate when VS Code updates Node ver
    const o = unfilteredTemplates.map(templateDatum => {
        return getResourcesForHandlerFromTemplateDatum(filepath, handler, templateDatum).map(resource => {
            return {
                ...resource,
                templateDatum,
            }
        })
    })
    if (o.length === 0) {
        return []
    }
    return o.reduce((acc, cur) => [...acc, ...cur])
}

/**
 * Returns an array of Cloudformation Resources in a TemplateDatum that is tied to the filepath and handler given.
 * @param filepath Handler file's path
 * @param handler Handler function from aforementioned file
 * @param templateDatum TemplateDatum object to search through
 */
export function getResourcesForHandlerFromTemplateDatum(
    filepath: string,
    handler: string,
    templateDatum: TemplateDatum
): { name: string; resourceData: CloudFormation.Resource }[] {
    const matchingResources: { name: string; resourceData: CloudFormation.Resource }[] = []
    const templateDirname = path.dirname(templateDatum.path)
    // template isn't a parent or sibling of file
    if (!isInDirectory(templateDirname, path.dirname(filepath))) {
        return []
    }

    // no resources
    const resources = templateDatum.template.Resources
    if (!resources) {
        return []
    }

    for (const key of Object.keys(resources)) {
        const resource = resources[key]
        // check if some sort of serverless function
        if (
            resource &&
            [CloudFormation.SERVERLESS_FUNCTION_TYPE, CloudFormation.LAMBDA_FUNCTION_TYPE].includes(resource.Type)
        ) {
            // parse template values that could potentially be refs
            const registeredRuntime = CloudFormation.getStringForProperty(
                resource.Properties?.Runtime,
                templateDatum.template
            )
            const registeredCodeUri = CloudFormation.getStringForProperty(
                resource.Properties?.CodeUri,
                templateDatum.template
            )
            const registeredHandler = CloudFormation.getStringForProperty(
                resource.Properties?.Handler,
                templateDatum.template
            )

            if (registeredRuntime && registeredHandler && registeredCodeUri) {
                // .NET is currently a special case in that the filepath and handler aren't specific.
                // For now: check if handler matches and check if the code URI contains the filepath.
                // TODO: Can we use Omnisharp to help guide us better?
                if (dotNetRuntimes.includes(registeredRuntime)) {
                    if (
                        handler === registeredHandler &&
                        isInDirectory(
                            pathutils.normalize(path.join(templateDirname, registeredCodeUri)),
                            pathutils.normalize(filepath)
                        )
                    ) {
                        matchingResources.push({ name: key, resourceData: resource })
                    }
                    // Interpreted languages all follow the same spec:
                    // ./path/to/handler/without/file/extension.handlerName
                    // Check to ensure filename and handler both match.
                } else {
                    try {
                        const parsedLambda = getLambdaDetails({
                            Handler: registeredHandler,
                            Runtime: registeredRuntime,
                        })
                        const functionName = handler.split('.').pop()
                        if (
                            pathutils.normalize(filepath) ===
                                pathutils.normalize(
                                    path.join(templateDirname, registeredCodeUri, parsedLambda.fileName)
                                ) &&
                            functionName === parsedLambda.functionName
                        ) {
                            matchingResources.push({ name: key, resourceData: resource })
                        }
                    } catch (e) {
                        // swallow error from getLambdaDetails: handler not a valid runtime, so skip to the next one
                    }
                }
            }
        }
    }

    return matchingResources
}
