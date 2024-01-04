/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'fs'
import { remove } from 'fs-extra'
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
import { isCloud9 } from '../shared/extensionUtilities'
import globals from '../shared/extensionGlobals'

export const resourceFileGlobPattern = '**/*.awsResource.json'

export class AwsResourceManager {
    private folder: string | undefined
    private schemas: Map<string, Schema>
    private openResources: Map<string, ResourceNode | ResourceTypeNode>

    public constructor(private readonly extensionContext: vscode.ExtensionContext) {
        this.schemas = new Map<string, Schema>()
        this.openResources = new Map<string, ResourceNode | ResourceTypeNode>()
    }

    public async new(type: ResourceTypeNode): Promise<vscode.TextEditor | undefined> {
        const uri = await this.createFile(type.typeName, 'new', getNewResourceJson())
        await this.registerSchema(type.typeName, uri, type.parent.cloudFormation)
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
                uri = await this.createFile(typeName, identifier, formattedModel)
                await this.registerSchema(typeName, uri, resource.parent.parent.cloudFormation)
                getLogger().debug(
                    `resourceManager: opening resource ${identifier} (${typeName}) in edit at ${uri.fsPath}`
                )
            }

            const doc = await vscode.workspace.openTextDocument(uri)
            if (existing && !isCloud9()) {
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

    public async close(uri: vscode.Uri, isEditorClosed?: boolean): Promise<void> {
        const path = uri.toString()
        if (this.openResources.has(path)) {
            getLogger().debug(`resourceManager: closing ${uri}`)

            if (!isEditorClosed) {
                // grab focus back to the desired document before closing the active editor
                await vscode.window.showTextDocument(uri)
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            }

            if (uri.scheme === 'file') {
                await remove(uri.fsPath)

                globals.schemaService.registerMapping({
                    uri,
                    type: 'json',
                    schema: undefined,
                })
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
        return this.schemas.get(typeName)?.typeSchema
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

    private async registerSchema(
        typeName: string,
        uri: vscode.Uri,
        cloudFormation: CloudFormationClient
    ): Promise<void> {
        await this.initialize()
        const normalizedTypeName = getNormalizedTypeName(typeName)

        let location = this.schemas.get(typeName)?.location
        if (!location) {
            const type = await cloudFormation.describeType(typeName)
            if (type && type.Schema) {
                const schemaFile = path.join(
                    this.extensionContext.globalStorageUri.fsPath,
                    `${normalizedTypeName}.schema.json`
                )
                writeFileSync(schemaFile, JSON.stringify(JSON.parse(type.Schema), undefined, 2))
                location = vscode.Uri.file(schemaFile)
                const typeSchema = JSON.parse(await readFileAsString(schemaFile)) as TypeSchema
                this.schemas.set(typeName, {
                    location,
                    typeSchema,
                })
            } else {
                getLogger().warn(`unable to download schema for ${typeName}`)
                return
            }
        }

        globals.schemaService.registerMapping(
            {
                uri,
                type: 'json',
                schema: location,
            },
            // Flush immediately so the onDidOpenTextDocument handler can work.
            true
        )
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

type Schema = {
    location: vscode.Uri
    typeSchema: TypeSchema
}

export interface TypeSchema {
    typeName?: string
    description?: string
    properties?: any
    primaryIdentifier?: string[]
    definitions?: any
    readOnlyProperties?: string[]
    createOnlyProperties?: string[]
    writeOnlyProperties?: string[]
    required?: string[]
}
