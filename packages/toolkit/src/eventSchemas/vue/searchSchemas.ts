/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { Schemas } from 'aws-sdk'
import * as vscode from 'vscode'
import { downloadSchemaItemCode } from '../commands/downloadSchemaItemCode'
import { RegistryItemNode } from '../explorer/registryItemNode'
import { SchemaItemNode } from '../explorer/schemaItemNode'
import { SchemasNode } from '../explorer/schemasNode'
import { listRegistryItems, searchSchemas } from '../utils'
import { DefaultSchemaClient, SchemaClient } from '../../shared/clients/schemaClient'

import { getLogger, Logger } from '../../shared/logger'
import { Result } from '../../shared/telemetry/telemetry'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { ExtContext } from '../../shared/extensions'
import { VueWebview } from '../../webviews/main'
import { telemetry } from '../../shared/telemetry/telemetry'

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

export class SearchSchemasWebview extends VueWebview {
    public readonly id = 'remoteInvoke'
    public readonly source = 'src/eventSchemas/vue/index.js'

    public constructor(
        private readonly channel: vscode.OutputChannel,
        private readonly client: SchemaClient,
        private readonly data: InitialData
    ) {
        super()
    }

    public init() {
        telemetry.schemas_view.emit({ result: 'Succeeded' })

        return this.data
    }

    public async fetchSchemaContent(summary: SchemaVersionedSummary, version?: string) {
        let selectedVersion = version
        let versionList: string[] | undefined

        if (!selectedVersion) {
            versionList = summary.VersionList
            selectedVersion = versionList[0]
        }

        const response = await this.client.describeSchema(
            summary.RegistryName,
            getSchemaNameFromTitle(summary.Title),
            selectedVersion
        )
        const prettySchema = JSON.stringify(JSON.parse(response.Content!), undefined, getTabSizeSetting())

        return {
            results: prettySchema,
            version: selectedVersion,
            versionList,
        }
    }

    public async searchSchemas(keyword: string) {
        try {
            const results = await getSearchResults(this.client, this.data.RegistryNames, keyword)
            telemetry.schemas_search.emit({ result: 'Succeeded' })

            return {
                results: results,
                resultsNotFound: results.length === 0,
            }
        } catch (error) {
            telemetry.schemas_search.emit({ result: 'Failed' })
            throw error
        }
    }

    public async downloadCodeBindings(summary: SchemaVersionedSummary) {
        const schemaItem: Schemas.SchemaSummary = {
            SchemaName: getSchemaNameFromTitle(summary.Title),
        }
        const schemaItemNode = new SchemaItemNode(schemaItem, this.client, summary.RegistryName)
        await downloadSchemaItemCode(schemaItemNode, this.channel)
    }
}

const Panel = VueWebview.compilePanel(SearchSchemasWebview)

export async function createSearchSchemasWebView(context: ExtContext, node: RegistryItemNode | SchemasNode) {
    const logger: Logger = getLogger()

    // note: this isn't tied to actually running a search (it's tied to opening the webview successfully), but this preserves existing metric behavior
    let webviewResult: Result = 'Succeeded'

    try {
        const client = new DefaultSchemaClient(node.regionCode)
        const registryNames = await getRegistryNames(node, client)
        if (registryNames.length === 0) {
            await vscode.window.showInformationMessage(
                localize('AWS.schemas.search.no_registries', 'No Schema Registries')
            )

            return
        }
        const wv = new Panel(context.extensionContext, context.outputChannel, client, {
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
        await wv.show({
            title: localize('AWS.executeStateMachine.title', 'Start Execution'),
            cssFiles: ['searchSchemas.css'],
        })
    } catch (err) {
        webviewResult = 'Failed'
        const error = err as Error
        logger.error('Error searching schemas: %s', error)
    } finally {
        telemetry.schemas_search.emit({ result: webviewResult })
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
            void vscode.window.showErrorMessage(
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

        void vscode.window.showErrorMessage(
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
