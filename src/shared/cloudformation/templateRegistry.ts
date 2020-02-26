/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

const TEMPLATE_FILE_GLOB_PATTERN = '**/template.{yaml,yml}'
let templateRegistry: CloudFormationTemplateRegistry | undefined

export interface CloudFormationTemplateRegistry {
    registeredTemplates: Map<string, TemplateData>
    dispose(): void
    isLambdaRegisteredInTemplate(path: string, handler: string, runtime: string): boolean
    populateRegistry(): Promise<void>
}

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

export class DefaultTemplateRegistry implements CloudFormationTemplateRegistry, vscode.Disposable {
    private readonly templateRegistryData: Map<string, TemplateData>
    private readonly watcher: vscode.FileSystemWatcher

    // provide globPattern if we want to change the template name we're looking for
    public constructor (private readonly globPattern: string = TEMPLATE_FILE_GLOB_PATTERN) {
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
     * Initial registry population is an asynchronous task and cannot be initiated in the constructor
     * Call this function immediately after constructing this class or else you'll have an empty registry
     * Handle as many template files as possible, as quickly as possible by queuing up all promises immediately
     */
    public async populateRegistry(): Promise<void> {
        const templateParsingPromises: Promise<void>[] = []

        // initial data population
        const templatePaths = await vscode.workspace.findFiles(this.globPattern)
        for (const templatePath of templatePaths) {
            templateParsingPromises.push(this.addTemplateToTemplateData(templatePath))
        }

        await Promise.all(templateParsingPromises)
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
     * Use for CodeLenses and to handle onRegistryChange events
     * @param path Absolute path to file containing Lambda
     * @param handler Lambda hander's name
     * @param runtime Lambda handler's runtime (as an additional sanity check)
     */
    public isLambdaRegisteredInTemplate(path: string, handler: string, runtime: string): boolean {
        for (const template of this.templateRegistryData.values()) {
            const pathInLambda = template.lambdas[path]
            if (pathInLambda && pathInLambda[handler] && pathInLambda[handler].runtime === runtime) {
                return true
            }
        }

        return false
    }

    /**
     * Disposes the vscode.FileSystemWatcher and vscode.EventEmitters tied to this class
     */
    public dispose(): void {
        this.watcher.dispose()
    }

    private async addTemplateToTemplateData(templatePath: vscode.Uri): Promise<void> {
        const resources: TemplateData = {
            lambdas: {}
        }
        // template parsing logic here
        this.templateRegistryData.set(templatePath.toString(), resources)
    }
}
