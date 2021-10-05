/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'fs'
import { rm } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { CloudFormationClient } from '../shared/clients/cloudFormationClient'
import {
    getNonexistentFilename,
    makeTemporaryToolkitFolder,
    readFileAsString,
    tryRemoveFolder,
} from '../shared/filesystemUtilities'
import { getLogger } from '../shared/logger/logger'
import { getTabSizeSetting } from '../shared/utilities/editorUtilities'
import { ResourceNode } from './explorer/nodes/resourceNode'
import { ResourceTypeNode } from './explorer/nodes/resourceTypeNode'
import { ext } from '../shared/extensionGlobals'

export const RESOURCE_FILE_GLOB_PATTERN = '**/*.awsResource.json'

export class AwsResourceManager {
    private folder: string | undefined
    private schemas: Map<string, TypeSchema>
    private openResources: Map<string, ResourceNode | ResourceTypeNode>

    public constructor(private readonly extensionContext: vscode.ExtensionContext) {
        this.schemas = new Map<string, TypeSchema>()
        this.openResources = new Map<string, ResourceNode | ResourceTypeNode>()
    }

    public async new(type: ResourceTypeNode): Promise<vscode.TextEditor | undefined> {
        await this.downloadTypeSchema(type.typeName, type.parent.cloudFormation)
        const uri = await this.createFile(type.typeName, 'new', getNewResourceJson())
        this.openResources.set(uri.toString(), type)

        getLogger().debug(`resourceManager: created resource for type ${type.typeName} at ${uri.fsPath}`)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc, { preview: false })
        const pos = editor.document.lineAt(1).range.end
        editor.selection = new vscode.Selection(pos, pos)
        return editor
    }

    public async open(resource: ResourceNode, preview?: boolean): Promise<vscode.TextEditor> {
        const typeName = resource.parent.typeName
        const identifier = resource.identifier
        const resourceDetails = await resource.parent.cloudControl.getResource({
            TypeName: typeName,
            Identifier: identifier,
        })

        if (resourceDetails.ResourceDescription && resourceDetails.ResourceDescription.Properties) {
            const formattedModel = formatResourceModel(resourceDetails.ResourceDescription.Properties)
            const normalizedTypeName = getNormalizedTypeName(typeName)
            const existing = this.toUri(resource)

            let uri: vscode.Uri
            if (preview) {
                uri = vscode.Uri.parse(`awsResource:${identifier}.${normalizedTypeName}.preview.json?${formattedModel}`)
                getLogger().debug(`resourceManager: opening resource ${identifier} (${typeName}) in preview`)
            } else {
                await this.downloadTypeSchema(typeName, resource.parent.parent.cloudFormation)
                uri = await this.createFile(typeName, identifier, formattedModel)
                getLogger().debug(
                    `resourceManager: opening resource ${identifier} (${typeName}) in edit at ${uri.fsPath}`
                )
            }

            const doc = await vscode.workspace.openTextDocument(uri)
            if (existing) {
                await this.close(existing)
            }

            this.openResources.set(uri.toString(), resource)
            return await vscode.window.showTextDocument(doc, { preview })
        } else {
            throw new Error(
                `failed to retrieve resource definition ${resource.identifier} (${resource.parent.typeName})`
            )
        }
    }

    public async close(uri: vscode.Uri): Promise<void> {
        const path = uri.toString()
        if (this.openResources.has(path)) {
            getLogger().debug(`resourceManager: closing ${uri}`)

            await vscode.window.showTextDocument(uri)
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')

            if (uri.scheme === 'file') {
                rm(uri.fsPath)
            }

            this.openResources.delete(path)
        }
    }

    public toUri(resource: ResourceNode): vscode.Uri | undefined {
        const existing = [...this.openResources.entries()]
            .filter(([_, v]) => {
                return (
                    v instanceof ResourceNode &&
                    v.identifier === resource.identifier &&
                    v.parent.typeName === resource.parent.typeName &&
                    v.parent.parent.region === resource.parent.parent.region
                )
            })
            .map(([k]) => k)
        return existing.length > 0 ? vscode.Uri.parse(existing[0]) : undefined
    }

    public fromUri(uri: vscode.Uri): ResourceNode | ResourceTypeNode | undefined {
        return this.openResources.get(uri.toString())
    }

    public getSchema(typeName: string): TypeSchema | undefined {
        return this.schemas.get(typeName)
    }

    private async initialize(): Promise<void> {
        if (!this.folder) {
            try {
                this.folder = await makeTemporaryToolkitFolder()
            } catch (err) {
                getLogger().error(`resourceManager: unable to create resource folder: %O`, err as Error)
                throw err
            }
        }
    }

    public async dispose(): Promise<void> {
        if (this.folder) {
            try {
                await tryRemoveFolder(this.folder)
            } catch (err) {
                getLogger().warn(`resourceManager: unable to remove folder on dispose: %O`, err as Error)
            }
        }
    }

    private async createFile(typeName: string, identifier: string, contents: string): Promise<vscode.Uri> {
        await this.initialize()

        const normalizedTypeName = getNormalizedTypeName(typeName)
        const filename = getNonexistentFilename(
            this.folder!,
            encodeURIComponent(identifier),
            `.${normalizedTypeName}.awsResource.json`
        )
        const fullPath = path.join(this.folder!, filename)
        writeFileSync(fullPath, contents)

        return vscode.Uri.file(fullPath)
    }

    private async downloadTypeSchema(typeName: string, cloudFormation: CloudFormationClient): Promise<void> {
        await this.initialize()

        if (this.schemas.has(typeName)) {
            return
        }

        const type = await cloudFormation.describeType(typeName)
        if (type && type.Schema) {
            const normalizedTypeName = getNormalizedTypeName(typeName)
            const schemaFile = path.join(this.extensionContext.globalStoragePath, `${normalizedTypeName}.schema.json`)
            writeFileSync(schemaFile, JSON.stringify(JSON.parse(type.Schema), undefined, 2))
            const fileMatch = `/*.${normalizedTypeName}.awsResource.json`
            ext.schemaService.registerMapping({
                path: fileMatch,
                type: 'json',
                schema: vscode.Uri.file(schemaFile),
            })
            const schema = JSON.parse(await readFileAsString(schemaFile)) as TypeSchema
            this.schemas.set(typeName, schema)
        } else {
            getLogger().warn(`unable to download schema for ${typeName}`)
        }
    }
}

export function formatResourceModel(input: string): string {
    return JSON.stringify(JSON.parse(input), undefined, getTabSizeSetting())
}

export function getNormalizedTypeName(typeName: string): string {
    return typeName.replace(/::/g, '')
}

function getNewResourceJson(): string {
    const spaces = getTabSizeSetting()
    return `{\n${' '.repeat(spaces)}\n}`
}

export interface TypeSchema {
    typeName: string
    description: string
    properties: any
    definitions: any
    readOnlyProperties: string[]
    createOnlyProperties: string[]
    writeOnlyProperties: string[]
    required: string[]
    primaryIdentifier: string[]
}
