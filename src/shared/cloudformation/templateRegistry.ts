/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'
import { CloudFormation } from './cloudformation'

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
        const pathAsString = templateUri.fsPath
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
        const template = this.templateRegistryData.get(path)
        if (template) {
            return {
                path,
                template,
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
        const pathAsString = templateUri.fsPath
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
 * Helper function that returns an map of resource names to CloudFormation.Resource objects.
 * Unlike a CloudFormation.TemplateResources object, all resources in this array are guaranteed to be defined.
 * @param templateDatum TemplateDatum object to extract resources from
 */
export function getResourcesFromTemplateDatum(templateDatum: TemplateDatum): Map<string, CloudFormation.Resource> {
    const map = new Map<string, CloudFormation.Resource>()
    for (const resourceKey of Object.keys(templateDatum.template.Resources!)) {
        const resource = templateDatum.template.Resources![resourceKey]
        if (resource) {
            map.set(resourceKey, resource)
        }
    }

    return map
}
