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
import { getLambdaDetails } from '../../lambda/utils'

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
 * Gets resources and additional metadata for resources tied to a filepath and handler.
 * Checks all registered templates by default; otherwise can operate on a subset TemplateDatum[]
 * @param filepath Handler file's path
 * @param handler Handler function from aforementioned file
 * @param unfilteredTemplates Array containing TemplateDatum objects to filter
 */
export function getResourcesForHandler(
    filepath: string,
    handler: string,
    unfilteredTemplates: TemplateDatum[] = CloudFormationTemplateRegistry.getRegistry().registeredTemplates
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
                                    path_.join(templateDirname, registeredCodeUri, parsedLambda.fileName)
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
