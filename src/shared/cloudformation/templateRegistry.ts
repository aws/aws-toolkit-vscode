/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { FileWatcherListener } from '../utilities/fileSystemWatcher'
import { CloudFormation } from './CloudFormation'

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
    addTemplateToTemplateData(templatePath: vscode.Uri): Promise<void>
    removeTemplateFromRegistry(templatePath: vscode.Uri): void
}

export class DefaultCloudFormationTemplateRegistryListener implements FileWatcherListener {
    public constructor(private readonly registry: CloudFormationTemplateRegistry) {}

    /**
     * Function used by a vscode.FileSystemWatcher to handle an onDidChange event.
     * Adds template to data map. TODO: Emit event
     * @param templateUri vscode.Uri for the changed template file
     */
    public async onListenedChange(templatePath: vscode.Uri): Promise<void> {
        await this.registry.addTemplateToTemplateData(templatePath)
        // TODO: fire event
    }

    /**
     * Function used by a vscode.FileSystemWatcher to handle an onDidCreate event.
     * Adds template to data map. TODO: Emit event
     * @param templateUri vscode.Uri for the created template file
     */
    public async onListenedCreate(templatePath: vscode.Uri): Promise<void> {
        await this.registry.addTemplateToTemplateData(templatePath)
        // TODO: fire event
    }

    /**
     * Function used by a vscode.FileSystemWatcher to handle an onDidDelete event.
     * Removes template from data map. TODO: Emit event
     * @param templateUri vscode.Uri for the deleted template file
     */
    public async onListenedDelete(templatePath: vscode.Uri): Promise<void> {
        this.registry.removeTemplateFromRegistry(templatePath)
        // TODO: fire event
    }

    /**
     * Disposes the  vscode.EventEmitters tied to this class
     * // TODO: Add event emitters to the class and dispose of them here
     */
    public dispose(): void {
        // TODO: Add event emitters to be disposed
    }
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
     * Adds template to template map. Wipes any existing template in its place with newly-parsed copy of the data.
     *
     * ***THIS SHOULD NOT BE CALLED EXTERNALLY OUTSIDE OF THE INITIAL REGISTRY POPULATION!!!***
     * @param templatePath vscode.Uri containing the template to load in
     */
    public async addTemplateToTemplateData(templatePath: vscode.Uri): Promise<void> {
        const pathAsString = templatePath.toString()
        const resources = await CloudFormation.load(pathAsString)
        this.templateRegistryData.set(pathAsString, resources)
    }

    public removeTemplateFromRegistry(templatePath: vscode.Uri): void {
        this.templateRegistryData.delete(templatePath.toString())
    }
}

/**
 * Returns data for a Lambda function registered in a CloudFormationTemplateRegistry, if it exists
 *
 * Beware! This doesn't currently check the filename itself, just handler and directory
 *
 * Use for CodeLenses and to handle onRegistryChange events
 *
 * TODO: Check for filename. Might need concessions for different languages
 * TODO: Return source template?
 * @param registry CloudFormationTemplateRegistry to check against
 * @param filepath Absolute path to file containing Lambda
 * @param handler Lambda hander's name
 */
export function getRegisteredLambdaFunction(
    registry: CloudFormationTemplateRegistry,
    filepath: string,
    handler: string
): CloudFormation.Resource | undefined {
    const registryData = registry.registeredTemplates

    registryData.forEach( (template, templatePath) => {
        const basePath = path.dirname(templatePath)
        if (template.Resources) {
            for (const resourceKey in template.Resources) {
                if (resourceKey) {
                    const resource = template.Resources[resourceKey]
                    // ...there's gotta be a better way than this
                    if (
                        resource &&
                        resource.Type === 'AWS::Serverless::Function' &&
                        resource.Properties &&
                        path.join(basePath, resource.Properties.CodeUri) === path.dirname(filepath) &&
                        resource.Properties.Handler.includes(handler)
                    ) {
                        return resource
                    }
                }
            }
        }
    })

    return undefined
}

/**
 * Returns a list of all registered Lambda functions, across all registered templates in a registry
 * 
 * TODO: Return source templates?
 * @param registry CloudFormationTemplateRegistry to pull Lambdas from
 */
export function getRegisteredLambdaFunctions(registry: CloudFormationTemplateRegistry): CloudFormation.Resource[] {
    const registeredFunctions: CloudFormation.Resource[] = []
    const registryData = registry.registeredTemplates

    registryData.forEach(template => {
        if (template.Resources) {
            for (const resourceKey in template.Resources) {
                if (resourceKey) {
                    const resource = template.Resources[resourceKey]
                    if (resource && resource.Type === 'AWS::Serverless::Function') {
                        registeredFunctions.push(resource)
                    }
                }
            }
        }
    })

    return registeredFunctions
}
