/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { FileWatcherListener } from '../utilities/fileSystemWatcher'

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

export interface CloudFormationTemplateRegistry extends vscode.Disposable, FileWatcherListener {
    registeredTemplates: Map<string, TemplateData>
    addTemplateToTemplateData(templatePath: vscode.Uri): Promise<void>
    isLambdaRegistered(path: string, handler: string, runtime: string): boolean
}

/**
 * Contains template data
 * Use absolute paths for resource pathing; should this include handler file?
 */
interface TemplateData {
    lambdas: {
        [resourcePath: string]: CloudFormationTemplateLambdaResource
    }
}

export interface CloudFormationTemplateLambdaResource {
    [handler: string]: {
        runtime: string
    }
}

export class DefaultCloudFormationTemplateRegistry implements CloudFormationTemplateRegistry {
    private readonly templateRegistryData: Map<string, TemplateData>
    private readonly watcher: vscode.FileSystemWatcher

    public constructor (globPattern: string) {
        this.templateRegistryData = new Map<string, TemplateData>()
        this.watcher = vscode.workspace.createFileSystemWatcher(globPattern)

        this.watcher.onDidChange(async (template) => {
            await this.addTemplateToTemplateData(template)
            // fire event
        })
        this.watcher.onDidCreate(async (template) => {
            await this.addTemplateToTemplateData(template)
            // fire event
        })
        this.watcher.onDidDelete((template) => {
            this.templateRegistryData.delete(template.toString())
            // fire event
        })
    }

    /**
     * Function used by a vscode.FileSystemWatcher to handle an onDidChange event.
     * Adds template to data map. TODO: Emit event
     * @param templateUri vscode.Uri for the changed template file
     */
    public async onListenedChange(templateUri: vscode.Uri): Promise<void> {
        await this.addTemplateToTemplateData(templateUri)
        // TODO: fire event
    }

    /**
     * Function used by a vscode.FileSystemWatcher to handle an onDidCreate event.
     * Adds template to data map. TODO: Emit event
     * @param templateUri vscode.Uri for the created template file
     */
    public async onListenedCreate(templateUri: vscode.Uri): Promise<void> {
        await this.addTemplateToTemplateData(templateUri)
        // TODO: fire event
    }

    /**
     * Function used by a vscode.FileSystemWatcher to handle an onDidDelete event.
     * Removes template from data map. TODO: Emit event
     * @param templateUri vscode.Uri for the deleted template file
     */
    public onListenedDelete(templateUri: vscode.Uri): void {
        this.templateRegistryData.delete(templateUri.toString())
        // TODO: fire event
    }

    /**
     * Returns the registry's data in Map form.
     * Key: template file name, Value: TemplateData object reflecting data in template
     */
    public get registeredTemplates(): Map<string, TemplateData> {
        return this.templateRegistryData
    }

    /**
     * Returns whether or not a specified Lambda is a part of the registry
     *
     * It is the responsibility of the caller to tailor path/handler/runtime to this format
     *
     * Use for CodeLenses and to handle onRegistryChange events
     * @param path Absolute path to file containing Lambda
     * @param handler Lambda hander's name
     * @param runtime Lambda handler's runtime (as an additional sanity check)
     */
    public isLambdaRegistered(path: string, handler: string, runtime: string): boolean {
        for (const template of this.templateRegistryData.values()) {
            const pathInLambda = template.lambdas[path]
            if (pathInLambda && pathInLambda[handler] && pathInLambda[handler].runtime === runtime) {
                return true
            }
        }

        return false
    }

    /**
     * Adds template to template map. Wipes any existing template in its place with newly-parsed copy of the data.
     *
     * ***THIS SHOULD NOT BE CALLED OUTSIDE OF THE INITIAL REGISTRY POPULATION!!!***
     * @param templatePath vscode.Uri containing the template to load in
     */
    public async addTemplateToTemplateData(templatePath: vscode.Uri): Promise<void> {
        const resources: TemplateData = {
            lambdas: {}
        }
        // TODO: template parsing logic here
        this.templateRegistryData.set(templatePath.toString(), resources)
    }

    /**
     * Disposes the vscode.FileSystemWatcher and vscode.EventEmitters tied to this class
     * // TODO: Add event emitters to the class and dispose of them here
     */
    public dispose(): void {
        this.watcher.dispose()
    }
}
