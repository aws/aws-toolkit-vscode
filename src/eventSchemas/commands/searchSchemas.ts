/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { Schemas } from 'aws-sdk'
import * as vscode from 'vscode'
import { downloadSchemaItemCode } from '../../eventSchemas/commands/downloadSchemaItemCode'
import { RegistryItemNode } from '../../eventSchemas/explorer/registryItemNode'
import { SchemaItemNode } from '../../eventSchemas/explorer/schemaItemNode'
import { SchemasNode } from '../../eventSchemas/explorer/schemasNode'
import { listRegistryItems, searchSchemas } from '../../eventSchemas/utils'
import { SchemaClient } from '../../shared/clients/schemaClient'

import { getLogger, Logger } from '../../shared/logger'
import { recordSchemasSearch, recordSchemasView, Result } from '../../shared/telemetry/telemetry'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import globals from '../../shared/extensionGlobals'
import { ExtContext } from '../../shared/extensions'
import { compileVueWebview } from '../../webviews/main'
import { WebviewServer } from '../../webviews/server'

interface InitialData {
    Header: string
    SearchInputPlaceholder: string
    VersionPrefix: string
    RegistryNames: string[]
    Region: string
    LocalizedMessages: {
        noSchemasFound: string
        searching: string
        loading: string
        select: string
    }
}

const VueWebview = compileVueWebview({
    id: 'remoteInvoke',
    title: localize('AWS.executeStateMachine.title', 'Start Execution'),
    webviewJs: 'eventSchemasVue.js',
    cssFiles: ['searchSchemas.css'],
    commands: {
        handler: function (message: CommandMessages) {
            handleSchemaSearchMessage(this, message)
        },
    },
    start: (init: InitialData) => init,
})
export class SearchSchemasWebview extends VueWebview {}

export async function createSearchSchemasWebView(context: ExtContext, node: RegistryItemNode | SchemasNode) {
    const logger: Logger = getLogger()
    // note: this isn't tied to actually running a search (it's tied to opening the webview successfully), but this preserves existing metric behavior
    let webviewResult: Result = 'Succeeded'

    try {
        const client: SchemaClient = globals.toolkitClientBuilder.createSchemaClient(node.regionCode)
        const registryNames = await getRegistryNames(node, client)
        if (registryNames.length === 0) {
            vscode.window.showInformationMessage(localize('AWS.schemas.search.no_registries', 'No Schema Registries'))

            return
        }
        const wv = new SearchSchemasWebview(context)
        await wv.start({
            RegistryNames: registryNames,
            Header: getPageHeader(registryNames),
            SearchInputPlaceholder: localize('AWS.schemas.search.input.placeholder', 'Search for schema keyword...'),
            VersionPrefix: localize('AWS.schemas.search.version.prefix', 'Search matched version:'),
            Region: node.regionCode,
            LocalizedMessages: {
                noSchemasFound: localize('AWS.schemas.search.no_results', 'No schemas found'),
                searching: localize('AWS.schemas.search.searching', 'Searching for schemas...'),
                loading: localize('AWS.schemas.search.loading', 'Loading...'),
                select: localize('AWS.schemas.search.select', 'Select a schema'),
            },
        })
    } catch (err) {
        webviewResult = 'Failed'
        const error = err as Error
        logger.error('Error searching schemas: %O', error)
    } finally {
        // TODO make this telemetry actually record failures
        recordSchemasSearch({ result: webviewResult })
    }
}

export async function getRegistryNames(node: RegistryItemNode | SchemasNode, client: SchemaClient): Promise<string[]> {
    const registryNames: string[] = []

    if (node instanceof SchemasNode) {
        try {
            const registries = await toArrayAsync(listRegistryItems(client))
            registries.forEach(element => registryNames.push(element.RegistryName!))
        } catch (err) {
            const error = err as Error
            getLogger().error(error)
            vscode.window.showErrorMessage(
                localize('AWS.message.error.schemas.search.failed_to_load_resources', 'Error loading Schemas resources')
            )
        }
    }

    if (node instanceof RegistryItemNode) {
        registryNames.push(node.registryName)
    }

    return registryNames
}

export function getPageHeader(registryNames: string[]): string {
    if (registryNames.length === 1) {
        return localize('AWS.schemas.search.header.text.singleRegistry', 'Search "{0}" registry', registryNames[0])
    }

    return localize('AWS.schemas.search.header.text.allRegistries', 'Search across all registries')
}

export interface CommandMessage {
    command: string
    regionCode: string
}

interface FetchSchemaContentCommand extends CommandMessage {
    version?: string
    schemaSummary: SchemaVersionedSummary
}
function isFetchSchemaContentCommand(c: CommandMessage): c is FetchSchemaContentCommand {
    return c.command === 'fetchSchemaContent'
}

interface SearchSchemasCommand extends CommandMessage {
    keyword: string
    registryNames: string[]
}
function isSearchSchemasCommand(c: CommandMessage): c is SearchSchemasCommand {
    return c.command === 'searchSchemas'
}

interface DownloadCodeBindingsCommand extends CommandMessage {
    schemaSummary: SchemaVersionedSummary
}
function isDownloadCodeBindingsCommand(c: CommandMessage): c is DownloadCodeBindingsCommand {
    return c.command === 'downloadCodeBindings'
}

export type CommandMessages =
    | FetchSchemaContentCommand
    | SearchSchemasCommand
    | DownloadCodeBindingsCommand
    | CommandMessage

export async function handleSchemaSearchMessage(
    server: Pick<WebviewServer, 'postMessage' | 'context'>,
    message: CommandMessages,
    testSchemaClient?: SchemaClient
) {
    const schemaClient = testSchemaClient ?? globals.toolkitClientBuilder.createSchemaClient(message.regionCode)
    if (isFetchSchemaContentCommand(message)) {
        recordSchemasView({ result: 'Succeeded' })

        let selectedVersion = message.version
        let versionList: string[] = []
        // if user has not selected version, set it to latestMatchingSchemaVerion
        if (!selectedVersion) {
            versionList = message.schemaSummary!.VersionList
            selectedVersion = versionList[0]
        }

        const response = await schemaClient.describeSchema(
            message.schemaSummary!.RegistryName!,
            getSchemaNameFromTitle(message.schemaSummary!.Title),
            selectedVersion
        )
        const prettySchema = JSON.stringify(JSON.parse(response.Content!), undefined, getTabSizeSetting())
        server.postMessage({
            command: 'showSchemaContent',
            results: prettySchema,
            version: selectedVersion,
        })

        //if versionList is intialized, dropdown needs to be populated
        if (versionList.length !== 0) {
            server.postMessage({ command: 'setVersionsDropdown', results: versionList })
        }

        return
    } else if (isSearchSchemasCommand(message)) {
        recordSchemasSearch({ result: 'Succeeded' })

        const results = await getSearchResults(schemaClient, message.registryNames, message.keyword!)

        server.postMessage({
            command: 'showSearchSchemaList',
            results: results,
            resultsNotFound: results.length === 0,
        })

        return
    } else if (isDownloadCodeBindingsCommand(message)) {
        const schemaItem: Schemas.SchemaSummary = {
            SchemaName: getSchemaNameFromTitle(message.schemaSummary!.Title),
        }
        const schemaItemNode = new SchemaItemNode(schemaItem, schemaClient, message.schemaSummary!.RegistryName!)
        await downloadSchemaItemCode(schemaItemNode, server.context.outputChannel)

        return
    } else {
        throw new Error(`Search webview command ${message.command} is invalid`)
    }
}

export interface SchemaVersionedSummary {
    RegistryName: string
    Title: string
    VersionList: string[]
}

export async function getSearchListForSingleRegistry(
    schemaClient: SchemaClient,
    registryName: string,
    keyword: string,
    prefix: string = ''
): Promise<SchemaVersionedSummary[]> {
    let results: SchemaVersionedSummary[] = []
    try {
        const schemas = await toArrayAsync(searchSchemas(schemaClient, keyword, registryName))
        results = getSchemaVersionedSummary(schemas, prefix)
    } catch (error) {
        const err = error as Error
        getLogger().error(err)

        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.schemas.search.failed_to_search_registry',
                'Unable to search registry {0}',
                registryName
            )
        )
    }

    return results
}

export async function getSearchResults(
    schemaClient: SchemaClient,
    registries: string[],
    keyword: string
): Promise<SchemaVersionedSummary[]> {
    let results: SchemaVersionedSummary[] = []

    await Promise.all(
        registries.map(async registryName => {
            let prefix = ''
            if (registries.length !== 1) {
                prefix = registryName.concat('/')
            }
            const perRegistryResults = await getSearchListForSingleRegistry(schemaClient, registryName, keyword, prefix)
            results = results.concat(perRegistryResults)
        })
    )

    return results
}

export function getSchemaVersionedSummary(searchSummary: Schemas.SearchSchemaSummary[], prefix: string) {
    const results = searchSummary.map(searchSchemaSummary => ({
        RegistryName: searchSchemaSummary.RegistryName!,
        Title: prefix.concat(searchSchemaSummary.SchemaName!),
        VersionList: searchSchemaSummary
            .SchemaVersions!.map(summary => summary.SchemaVersion!)
            .sort(sortNumericStringsInDescendingOrder),
    }))

    return results
}

export function getSchemaNameFromTitle(title: string) {
    const name = title.split('/')

    return name[name.length - 1]
}

function sortNumericStringsInDescendingOrder(a: string, b: string) {
    return b.localeCompare(a, undefined, { numeric: true })
}
