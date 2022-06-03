/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, writeFileSync } from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import globals from './extensionGlobals'
import { activateYamlExtension, YamlExtension } from './extensions/yaml'
import * as filesystemUtilities from './filesystemUtilities'
import * as pathutil from '../shared/utilities/pathUtils'
import { getLogger } from './logger'
import { FileResourceFetcher } from './resourcefetcher/fileResourceFetcher'
import { getPropertyFromJsonUrl, HttpResourceFetcher } from './resourcefetcher/httpResourceFetcher'
import { Settings } from './settings'
import { once } from './utilities/functionUtils'
import { normalizeSeparator } from './utilities/pathUtils'
import { Any, ArrayConstructor } from './utilities/typeConstructors'

const GOFORMATION_MANIFEST_URL = 'https://api.github.com/repos/awslabs/goformation/releases/latest'

export type Schemas = { [key: string]: vscode.Uri }
export type SchemaType = 'yaml' | 'json'

export interface SchemaMapping {
    path: string
    type: SchemaType
    schema?: string | vscode.Uri
}

export interface SchemaHandler {
    /** Adds or removes a schema mapping to the given `schemas` collection. */
    handleUpdate(mapping: SchemaMapping, schemas: Schemas): Promise<void>
    /** Returns true if the given file path is handled by this `SchemaHandler`. */
    isMapped(f: vscode.Uri | string): boolean
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
            /** Assigned in start(). */
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

    public isMapped(uri: vscode.Uri): boolean {
        for (const h of this.handlers.values()) {
            if (h.isMapped(uri)) {
                return true
            }
        }
        return false
    }

    public async start(): Promise<void> {
        getDefaultSchemas(this.extensionContext).then(schemas => (this.schemas = schemas))
        await this.startTimer()
    }

    /**
     * Registers a schema mapping in the schema service.
     *
     * @param mapping
     * @param flush Flush immediately instead of waiting for timer.
     */
    public registerMapping(mapping: SchemaMapping, flush?: boolean): void {
        this.updateQueue.push(mapping)
        if (flush === true) {
            this.processUpdates()
        }
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
        this.timer = globals.clock.setTimeout(
            // this is async so that we don't have pseudo-concurrent invocations of the callback
            async () => {
                await this.processUpdates()
                this.timer?.refresh()
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
            normalizeSeparator(path.join(extensionContext.globalStorageUri.fsPath, 'cloudformation.schema.json'))
        )
        const samSchemaUri = vscode.Uri.file(
            normalizeSeparator(path.join(extensionContext.globalStorageUri.fsPath, 'sam.schema.json'))
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
        // this.schemas will be undefined for the rest of the session, so
        // processUpdates() will never do its work.
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
    const outdated = params.version && params.version !== cachedVersion
    if (!outdated) {
        // Check that the cached file actually can be fetched. Else we might
        // never update the cache.
        const fileFetcher = new FileResourceFetcher(params.filepath)
        const content = await fileFetcher.get()
        if (content) {
            return content
        }
    }

    const httpFetcher = new HttpResourceFetcher(params.url, {
        showUrl: true,
        // updates curr version
        onSuccess: contents => {
            writeFileSync(params.filepath, contents)
            params.extensionContext.globalState.update(params.cacheKey, params.version)
        },
    })
    const content = await httpFetcher.get()
    if (!content) {
        throw new Error(`failed to resolve schema: ${params.filepath}`)
    }
    return content
}

/**
 * Adds custom tags to the YAML extension's settings in order to hide error
 * notifications for SAM/CFN intrinsic functions if a user has the YAML extension.
 *
 * Lifted near-verbatim from the cfn-lint VSCode extension.
 * https://github.com/aws-cloudformation/cfn-lint-visual-studio-code/blob/629de0bac4f36cfc6534e409a6f6766a2240992f/client/src/extension.ts#L56
 */
async function addCustomTags(config = Settings.instance): Promise<void> {
    const settingName = 'yaml.customTags'
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

    try {
        const currentTags = config.get(settingName, ArrayConstructor(Any), [])
        const missingTags = cloudFormationTags.filter(item => !currentTags.includes(item))

        if (missingTags.length > 0) {
            const updateTags = currentTags.concat(missingTags)

            await config.update(settingName, updateTags)
        }
    } catch (error) {
        getLogger().error('schemas: failed to update setting "%s": %O', settingName, error)
    }
}

/**
 * Registers YAML schema mappings with the Red Hat YAML extension
 */
export class YamlSchemaHandler implements SchemaHandler {
    public constructor(private yamlExtension?: YamlExtension) {}

    isMapped(file: string | vscode.Uri): boolean {
        if (!this.yamlExtension) {
            return false
        }
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file
        const exists = !!this.yamlExtension?.getSchema(uri)
        return exists
    }

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
    private readonly clean = once(() => this.cleanResourceMappings())

    public constructor(private readonly config = Settings.instance) {}

    public isMapped(file: string | vscode.Uri): boolean {
        const setting = this.getSettingBy({ file: file })
        return !!setting
    }

    /**
     * Gets a json schema setting by filtering on schema path and/or file path.
     * @param args.schemaPath Path to the schema file
     * @param args.file Path to the file being edited by the user
     */
    private getSettingBy(args: {
        schemaPath?: string | vscode.Uri
        file?: string | vscode.Uri
    }): JSONSchemaSettings | undefined {
        const path = typeof args.file === 'string' ? args.file : args.file?.fsPath
        const schm = typeof args.schemaPath === 'string' ? args.schemaPath : args.schemaPath?.fsPath
        const settings = this.getJsonSettings()
        const setting = settings.find(schema => {
            const schmMatch = schm && schema.url && pathutil.normalize(schema.url) === pathutil.normalize(schm)
            const fileMatch = path && schema.fileMatch && schema.fileMatch.includes(path)
            return (!path || fileMatch) && (!schm || schmMatch)
        })
        return setting
    }

    async handleUpdate(mapping: SchemaMapping, schemas: Schemas): Promise<void> {
        await this.clean()

        let settings = this.getJsonSettings()

        if (mapping.schema) {
            const uri = resolveSchema(mapping.schema, schemas).toString()
            const existing = this.getSettingBy({ schemaPath: uri })

            if (existing) {
                if (!existing.fileMatch) {
                    getLogger().debug(`JsonSchemaHandler: skipped setting schema '${uri}'`)
                } else {
                    existing.fileMatch.push(mapping.path)
                }
            } else {
                settings.push({
                    fileMatch: [mapping.path],
                    url: uri,
                })
            }
        } else {
            settings = filterJsonSettings(settings, file => file !== mapping.path)
        }

        await this.config.update('json.schemas', settings)
    }

    /**
     * Attempts to find and remove orphaned resource mappings for AWS Resource documents
     */
    private async cleanResourceMappings(): Promise<void> {
        getLogger().debug(`JsonSchemaHandler: cleaning stale schemas`)

        // In the unlikely scenario of an error, we don't want to bubble it up
        try {
            const settings = filterJsonSettings(this.getJsonSettings(), file => !file.endsWith('.awsResource.json'))
            await this.config.update('json.schemas', settings)
        } catch (error) {
            getLogger().warn(`JsonSchemaHandler: failed to clean stale schemas: ${error}`)
        }
    }

    private getJsonSettings(): JSONSchemaSettings[] {
        return this.config.get('json.schemas', ArrayConstructor(Object), [])
    }
}

function resolveSchema(schema: string | vscode.Uri, schemas: Schemas): vscode.Uri {
    if (schema instanceof vscode.Uri) {
        return schema
    }
    return schemas[schema]
}

function filterJsonSettings(settings: JSONSchemaSettings[], predicate: (fileName: string) => boolean) {
    return settings.filter(schema => {
        schema.fileMatch = schema.fileMatch?.filter(file => predicate(file))

        // Assumption: `fileMatch` was not empty beforehand
        return schema.fileMatch === undefined || schema.fileMatch.length > 0
    })
}

export interface JSONSchemaSettings {
    fileMatch?: string[]
    url?: string
    schema?: any
}
