/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, writeFileSync } from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { activateYamlExtension, YamlExtension } from './extensions/yaml'
import * as filesystemUtilities from './filesystemUtilities'
import { getLogger } from './logger'
import { CompositeResourceFetcher } from './resourcefetcher/compositeResourceFetcher'
import { FileResourceFetcher } from './resourcefetcher/fileResourceFetcher'
import { getPropertyFromJsonUrl, HttpResourceFetcher } from './resourcefetcher/httpResourceFetcher'
import { ResourceFetcher } from './resourcefetcher/resourcefetcher'
import { normalizeSeparator } from './utilities/pathUtils'

const GOFORMATION_MANIFEST_URL = 'https://api.github.com/repos/awslabs/goformation/releases/latest'

export type Schemas = { [key: string]: vscode.Uri }
export type SchemaType = 'yaml' | 'json'

export interface SchemaMapping {
    path: string
    type: SchemaType
    schema?: string | vscode.Uri
}

export interface SchemaHandler {
    handleUpdate(mapping: SchemaMapping, schemas: Schemas): Promise<void>
}

/**
 * Processes the update of schema mappings for files in the workspace
 */
export class SchemaService {
    private static readonly DEFAULT_UPDATE_PERIOD_MILLIS = 1000

    private updatePeriod: number
    private timer?: NodeJS.Timer

    private updateQueue: SchemaMapping[] = []
    private schemas?: Schemas
    private handlers: Map<SchemaType, SchemaHandler>

    public constructor(
        private readonly extensionContext: vscode.ExtensionContext,
        opts?: {
            schemas?: Schemas
            updatePeriod?: number
            handlers?: Map<SchemaType, SchemaHandler>
        }
    ) {
        this.updatePeriod = opts?.updatePeriod ?? SchemaService.DEFAULT_UPDATE_PERIOD_MILLIS
        this.schemas = opts?.schemas
        this.handlers =
            opts?.handlers ??
            new Map<SchemaType, SchemaHandler>([
                ['json', new JsonSchemaHandler()],
                ['yaml', new YamlSchemaHandler()],
            ])
    }

    public async start(): Promise<void> {
        getDefaultSchemas(this.extensionContext).then(schemas => (this.schemas = schemas))
        await cleanResourceMappings()
        await this.startTimer()
    }

    public registerMapping(mapping: SchemaMapping): void {
        this.updateQueue.push(mapping)
    }

    public async processUpdates(): Promise<void> {
        if (this.updateQueue.length === 0 || !this.schemas) {
            return
        }

        const batch = this.updateQueue.splice(0, this.updateQueue.length)
        for (const mapping of batch) {
            const { type, schema, path } = mapping
            const handler = this.handlers.get(type)
            if (!handler) {
                throw new Error(`no registered handler for type ${type}`)
            }
            getLogger().debug(
                'schema service: handle %s mapping: %s -> %s',
                type,
                schema?.toString() ?? '[removed]',
                path
            )
            await handler.handleUpdate(mapping, this.schemas)
        }
    }

    // TODO: abstract into a common abstraction for background pollers
    private async startTimer(): Promise<void> {
        this.timer = setTimeout(
            // this is async so that we don't have pseudo-concurrent invocations of the callback
            async () => {
                await this.processUpdates()
                // Race: _timer may be undefined after shutdown() (this async
                // closure may be pending on the event-loop, despite clearTimeout()).
                if (this.timer !== undefined) {
                    this.timer!.refresh()
                }
            },
            this.updatePeriod
        )
    }
}

/**
 * Loads default JSON schemas for CFN and SAM templates.
 * Checks manifest and downloads new schemas if the manifest version has been bumped.
 * Uses local, predownloaded version if up-to-date or network call fails
 * If the user has not previously used the toolkit and cannot pull the manifest, does not provide template autocomplete.
 * @param extensionContext VSCode extension context
 */
export async function getDefaultSchemas(extensionContext: vscode.ExtensionContext): Promise<Schemas | undefined> {
    try {
        // Convert the paths to URIs which is what the YAML extension expects
        const cfnSchemaUri = vscode.Uri.file(
            normalizeSeparator(path.join(extensionContext.globalStoragePath, 'cloudformation.schema.json'))
        )
        const samSchemaUri = vscode.Uri.file(
            normalizeSeparator(path.join(extensionContext.globalStoragePath, 'sam.schema.json'))
        )
        const goformationSchemaVersion = await getPropertyFromJsonUrl(GOFORMATION_MANIFEST_URL, 'tag_name')

        await getRemoteOrCachedFile({
            filepath: cfnSchemaUri.fsPath,
            version: goformationSchemaVersion,
            url: `https://raw.githubusercontent.com/awslabs/goformation/${goformationSchemaVersion}/schema/cloudformation.schema.json`,
            cacheKey: 'cfnSchemaVersion',
            extensionContext,
        })
        await getRemoteOrCachedFile({
            filepath: samSchemaUri.fsPath,
            version: goformationSchemaVersion,
            url: `https://raw.githubusercontent.com/awslabs/goformation/${goformationSchemaVersion}/schema/sam.schema.json`,
            cacheKey: 'samSchemaVersion',
            extensionContext,
        })
        return {
            cfn: cfnSchemaUri,
            sam: samSchemaUri,
        }
    } catch (e) {
        getLogger().verbose('Could not refresh schemas: %s', (e as Error).message)
        return undefined
    }
}

/**
 * Pulls a remote version of file if the local version doesn't match the manifest version (does not check semver increases) or doesn't exist
 * Pulls local version of file if it does. Uses remote as baskup in case local doesn't exist
 * @param params.filepath Path to local file
 * @param params.version Remote version
 * @param params.url Url to fetch from
 * @param params.cacheKey Cache key to check version against
 * @param params.extensionContext VSCode extension context
 */
export async function getRemoteOrCachedFile(params: {
    filepath: string
    version?: string
    url: string
    cacheKey: string
    extensionContext: vscode.ExtensionContext
}): Promise<string> {
    const dir = path.parse(params.filepath).dir
    if (!(await filesystemUtilities.fileExists(dir))) {
        mkdirSync(dir, { recursive: true })
    }
    const cachedVersion = params.extensionContext.globalState.get<string>(params.cacheKey)
    const fetchers: ResourceFetcher[] = []
    if (params.version && params.version !== cachedVersion) {
        fetchers.push(
            new HttpResourceFetcher(params.url, {
                showUrl: true,
                // updates curr version
                onSuccess: contents => {
                    writeFileSync(params.filepath, contents)
                    params.extensionContext.globalState.update(params.cacheKey, params.version)
                },
            })
        )
    }
    fetchers.push(new FileResourceFetcher(params.filepath))
    const fetcher = new CompositeResourceFetcher(...fetchers)

    const result = await fetcher.get()
    if (!result) {
        throw new Error(`could not resolve schema at ${params.filepath}`)
    }
    return result
}

/**
 * Adds custom tags to the YAML extension's settings in order to hide error
 * notifications for SAM/CFN intrinsic functions if a user has the YAML extension.
 *
 * Lifted near-verbatim from the cfn-lint VSCode extension.
 * https://github.com/aws-cloudformation/cfn-lint-visual-studio-code/blob/629de0bac4f36cfc6534e409a6f6766a2240992f/client/src/extension.ts#L56
 */
async function addCustomTags(): Promise<void> {
    const settingName = 'yaml.customTags'
    const currentTags = vscode.workspace.getConfiguration().get<string[]>(settingName) ?? []
    if (!Array.isArray(currentTags)) {
        getLogger().error(
            'setting "%s" is not an array. SAM/CFN intrinsic functions will not be recognized.',
            settingName
        )
        return
    }
    const cloudFormationTags = [
        '!And',
        '!And sequence',
        '!If',
        '!If sequence',
        '!Not',
        '!Not sequence',
        '!Equals',
        '!Equals sequence',
        '!Or',
        '!Or sequence',
        '!FindInMap',
        '!FindInMap sequence',
        '!Base64',
        '!Join',
        '!Join sequence',
        '!Cidr',
        '!Ref',
        '!Sub',
        '!Sub sequence',
        '!GetAtt',
        '!GetAZs',
        '!ImportValue',
        '!ImportValue sequence',
        '!Select',
        '!Select sequence',
        '!Split',
        '!Split sequence',
    ]
    const missingTags = cloudFormationTags.filter(item => !currentTags.includes(item))
    if (missingTags.length > 0) {
        const updateTags = currentTags.concat(missingTags)
        try {
            await vscode.workspace
                .getConfiguration()
                .update('yaml.customTags', updateTags, vscode.ConfigurationTarget.Global)
        } catch (err) {
            getLogger().warn('schemas: failed to add CFN YAML tags: %s', (err as Error).message)
        }
    }
}

/**
 * Registers YAML schema mappings with the Red Hat YAML extension
 */
export class YamlSchemaHandler implements SchemaHandler {
    public constructor(private yamlExtension?: YamlExtension) {}

    async handleUpdate(mapping: SchemaMapping, schemas: Schemas): Promise<void> {
        if (!this.yamlExtension) {
            const ext = await activateYamlExtension()
            if (!ext) {
                return
            }
            await addCustomTags()
            this.yamlExtension = ext
        }

        const path = vscode.Uri.file(normalizeSeparator(mapping.path))
        if (mapping.schema) {
            this.yamlExtension.assignSchema(path, resolveSchema(mapping.schema, schemas))
        } else {
            this.yamlExtension.removeSchema(path)
        }
    }
}

/**
 * Registers JSON schema mappings with the built-in VSCode JSON schema language server
 */
export class JsonSchemaHandler implements SchemaHandler {
    public constructor(private config?: vscode.WorkspaceConfiguration) {}

    async handleUpdate(mapping: SchemaMapping, schemas: Schemas): Promise<void> {
        let settings = getJsonSettings(this.config)

        if (mapping.schema) {
            const uri = resolveSchema(mapping.schema, schemas).toString()
            const existing = settings.find(schema => schema.url === uri)
            if (existing) {
                existing.fileMatch?.push(mapping.path)
            } else {
                settings.push({
                    fileMatch: [mapping.path],
                    url: uri,
                })
            }
        } else {
            settings = filterJsonSettings(settings, file => file !== mapping.path)
        }

        await setJsonSettings(settings, this.config)
    }
}

function resolveSchema(schema: string | vscode.Uri, schemas: Schemas): vscode.Uri {
    if (schema instanceof vscode.Uri) {
        return schema
    }
    return schemas[schema]
}

/**
 * Attempts to find and remove orphaned resource mappings for AWS Resource documents
 */
export async function cleanResourceMappings(config?: vscode.WorkspaceConfiguration): Promise<void> {
    let settings = getJsonSettings(config)
    settings = filterJsonSettings(settings, file => !file.endsWith('.awsResource.json'))
    await setJsonSettings(settings, config)
}

function getJsonSettings(workspaceConfig?: vscode.WorkspaceConfiguration): JSONSchemaSettings[] {
    const config = workspaceConfig ?? vscode.workspace.getConfiguration('json')
    return config.get('schemas') ?? []
}

// TODO: we should be using a shared settings class for error handling, not accessing the API directly
async function setJsonSettings(settings: JSONSchemaSettings[], workspaceConfig?: vscode.WorkspaceConfiguration) {
    const config = workspaceConfig ?? vscode.workspace.getConfiguration('json')
    try {
        await config.update('schemas', settings, vscode.ConfigurationTarget.Global)
    } catch (err) {
        getLogger().warn('schemas: failed to update JSON schemas: %s', (err as Error).message)
    }
}

function filterJsonSettings(settings: JSONSchemaSettings[], predicate: (fileName: string) => boolean) {
    return settings.filter(schema => {
        schema.fileMatch = schema.fileMatch?.filter(file => predicate(file))
        return schema.fileMatch && schema.fileMatch.length > 0
    })
}

export interface JSONSchemaSettings {
    fileMatch?: string[]
    url?: string
    schema?: any
}
