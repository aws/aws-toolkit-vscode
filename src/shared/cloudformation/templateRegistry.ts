/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileURLToPath } from 'url'
import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'
import { CloudFormation } from './cloudformation'

let templateRegistry: CloudFormationTemplateRegistry | undefined

export function getTemplateRegistry(): CloudFormationTemplateRegistry {
    if (!templateRegistry) {
        throw new Error(
            'Template Registry not initialized. Extension code should call activate() from shared/cloudformation/activation, test code should call setTemplateRegistry().'
        )
    }

    return templateRegistry
}

export function setTemplateRegistry(registry: CloudFormationTemplateRegistry | undefined): void {
    templateRegistry = registry
}

export interface CloudFormationTemplateRegistry {
    registeredTemplates: Map<string, CloudFormation.Template>
    getRegisteredTemplate(templatePath: string): CloudFormation.Template | undefined
    addTemplateToRegistry(templateUri: vscode.Uri): Promise<void>
    addTemplatesToRegistry(templateUris: vscode.Uri[]): Promise<void>
    removeTemplateFromRegistry(templateUri: vscode.Uri): void
    reset(): void
}

export class DefaultCloudFormationTemplateRegistry implements CloudFormationTemplateRegistry {
    private readonly templateRegistryData: Map<string, CloudFormation.Template>

    public constructor () {
        this.templateRegistryData = new Map<string, CloudFormation.Template>()
    }

    /**
     * Returns the registry's data in Map form.
     * Key: template file name, Value: TemplateData object reflecting data in template
     * TODO: Do we want to return this as a map, an array, or a JS object?
     */
    public get registeredTemplates(): Map<string, CloudFormation.Template> {
        return this.templateRegistryData
    }

    /**
     * Get a specific template's data
     * @param templatePath Path to template of interest
     */
    public getRegisteredTemplate(templatePath: string): CloudFormation.Template | undefined {
        return this.templateRegistryData.get(templatePath)
    }

    /**
     * Adds template to registry. Wipes any existing template in its place with newly-parsed copy of the data.
     * @param templateUri vscode.Uri containing the template to load in
     */
    public async addTemplateToRegistry(templateUri: vscode.Uri): Promise<void> {
        const pathAsString = fileURLToPath(templateUri.fsPath)
        const resources = await CloudFormation.load(pathAsString)
        this.templateRegistryData.set(pathAsString, resources)
    }

    /**
     * Removes a template from the registry.
     * @param templateUri vscode.Uri containing template to remove
     */
    public removeTemplateFromRegistry(templateUri: vscode.Uri): void {
        const pathAsString = fileURLToPath(templateUri.fsPath)
        this.templateRegistryData.delete(pathAsString)
    }

    /**
     * Removes all templates from the registry.
     */
    public reset() {
        this.templateRegistryData.clear()
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
}
