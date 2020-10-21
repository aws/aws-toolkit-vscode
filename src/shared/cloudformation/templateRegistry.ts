/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path_ from 'path'
import { getLogger } from '../logger/logger'
import { CloudFormation } from './cloudformation'
import * as pathutils from '../utilities/pathUtils'
import { isInDirectory } from '../filesystemUtilities'
import { dotNetRuntimes } from '../../lambda/models/samLambdaRuntime'
import { getLambdaDetailsFromConfiguration } from '../../lambda/utils'

export interface TemplateDatum {
    path: string
    template: CloudFormation.Template
}

export class CloudFormationTemplateRegistry {
    private static INSTANCE: CloudFormationTemplateRegistry | undefined
    private readonly templateRegistryData: Map<string, CloudFormation.Template>

    public constructor() {
        this.templateRegistryData = new Map<string, CloudFormation.Template>()
    }

    private assertAbsolute(path: string) {
        if (!path_.isAbsolute(path)) {
            throw Error(`CloudFormationTemplateRegistry: path is relative: ${path}`)
        }
    }

    /**
     * Adds multiple templates to the registry.
     * Invalid templates will have a message logged but otherwise will not report a failure.
     * @param templateUris Array of vscode.Uris containing templates to remove
     */
    public async addTemplatesToRegistry(templateUris: vscode.Uri[]) {
        for (const templateUri of templateUris) {
            try {
                await this.addTemplateToRegistry(templateUri)
            } catch (e) {
                const err = e as Error
                getLogger().verbose(`Template ${templateUri} is malformed: ${err.message}`)
            }
        }
    }

    /**
     * Adds template to registry. Wipes any existing template in its place with newly-parsed copy of the data.
     * @param templateUri vscode.Uri containing the template to load in
     */
    public async addTemplateToRegistry(templateUri: vscode.Uri, quiet?: boolean): Promise<void> {
        const pathAsString = pathutils.normalize(templateUri.fsPath)
        this.assertAbsolute(pathAsString)
        try {
            const template = await CloudFormation.load(pathAsString)
            this.templateRegistryData.set(pathAsString, template)
        } catch (e) {
            if (!quiet) {
                throw e
            }
            getLogger().verbose(`CloudFormationTemplateRegistry: invalid CFN template: ${e}`)
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
     * Removes all templates from the registry.
     */
    public reset() {
        this.templateRegistryData.clear()
    }

    /**
     * Returns the CloudFormationTemplateRegistry singleton.
     * If the singleton doesn't exist, creates it.
     */
    public static getRegistry(): CloudFormationTemplateRegistry {
        if (!CloudFormationTemplateRegistry.INSTANCE) {
            CloudFormationTemplateRegistry.INSTANCE = new CloudFormationTemplateRegistry()
        }

        return CloudFormationTemplateRegistry.INSTANCE
    }
}

/**
 * Filters an array of TemplateDatum objects to those that are tied to the given filepath and handler function.
 * @param filepath Handler file's path
 * @param handler Handler function from aforementioned file
 * @param unfilteredTemplates Array containing TemplateDatum objects to filter
 */
export function getTemplatesAssociatedWithHandler(
    filepath: string,
    handler: string,
    unfilteredTemplates: TemplateDatum[] = CloudFormationTemplateRegistry.getRegistry().registeredTemplates
): TemplateDatum[] {
    // find potential matching templates
    return unfilteredTemplates.filter(templateDatum => {
        return getResourcesAssociatedWithHandlerFromTemplateDatum(filepath, handler, templateDatum).length > 0
    })
}

/**
 * Returns an array of Cloudformation Resources in a TemplateDatum that is tied to the filepath and handler given.
 * @param filepath Handler file's path
 * @param handler Handler function from aforementioned file
 * @param templateDatum TemplateDatum object to search through
 */
export function getResourcesAssociatedWithHandlerFromTemplateDatum(
    filepath: string,
    handler: string,
    templateDatum: TemplateDatum
): CloudFormation.Resource[] {
    const matchingResources: CloudFormation.Resource[] = []
    const templateDirname = path_.dirname(templateDatum.path)
    // template isn't a parent or sibling of file
    if (!isInDirectory(templateDirname, path_.dirname(filepath))) {
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
                            pathutils.normalize(path_.join(templateDirname, registeredCodeUri)),
                            pathutils.normalize(filepath)
                        )
                    ) {
                        matchingResources.push(resource)
                    }
                    // Interpreted languages all follow the same spec:
                    // ./path/to/handler/without/file/extension.handlerName
                    // Check to ensure filename and handler both match.
                } else {
                    try {
                        const parsedLambda = getLambdaDetailsFromConfiguration({
                            Handler: registeredHandler,
                            Runtime: registeredRuntime,
                        })
                        const functionName = handler.split('.').pop()
                        if (
                            pathutils.normalize(filepath) ===
                                pathutils.normalize(
                                    path_.join(templateDirname, registeredCodeUri, parsedLambda.fileName)
                                ) &&
                            functionName === parsedLambda.functionName
                        ) {
                            matchingResources.push(resource)
                        }
                    } catch (e) {
                        // swallow error from getLambdaDetailsFromConfiguration: handler not a valid runtime, so skip to the next one
                    }
                }
            }
        }
    }

    return matchingResources
}
