/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { Schemas } from 'aws-sdk'
import _ = require('lodash')
import path = require('path')
import * as vscode from 'vscode'
import { downloadSchemaItemCode } from '../../eventSchemas/commands/downloadSchemaItemCode'
import { RegistryItemNode } from '../../eventSchemas/explorer/registryItemNode'
import { SchemaItemNode } from '../../eventSchemas/explorer/schemaItemNode'
import { SchemasNode } from '../../eventSchemas/explorer/schemasNode'
import { listRegistryItems, searchSchemas } from '../../eventSchemas/utils'
import { SchemaClient } from '../../shared/clients/schemaClient'
import { ext } from '../../shared/extensionGlobals'
import { ExtensionUtilities } from '../../shared/extensionUtilities'
import { getLogger, Logger } from '../../shared/logger'
import { recordSchemasSearch, recordSchemasView, Result } from '../../shared/telemetry/telemetry'
import { TelemetryService } from '../../shared/telemetry/telemetryService'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { SchemaTemplates } from '../templates/searchSchemasTemplates'

export async function createSearchSchemasWebView(params: { node: RegistryItemNode | SchemasNode }) {
    const logger: Logger = getLogger()
    const client: SchemaClient = ext.toolkitClientBuilder.createSchemaClient(params.node.regionCode)
    const registryNames = await getRegistryNames(params.node, client)
    let webviewResult: Result = 'Succeeded'

    try {
        if (registryNames.length === 0) {
            vscode.window.showInformationMessage(localize('AWS.schemas.search.no_registries', 'No Schema Registries'))

            return
        }

        const view = vscode.window.createWebviewPanel(
            'html',
            localize('AWS.schemas.search.title', 'EventBridge Schemas Search'),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(ext.context.extensionPath, 'media'))],
            }
        )
        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        const searchTemplate = _.template(SchemaTemplates.SEARCH_TEMPLATE)
        const loadScripts = ExtensionUtilities.getScriptsForHtml(['searchSchemasVue.js'])
        const loadLibs = ExtensionUtilities.getLibrariesForHtml(['vue.min.js', 'lodash.min.js'])
        const loadStylesheets = ExtensionUtilities.getCssForHtml(['searchSchemas.css'])

        view.webview.html = baseTemplateFn({
            content: searchTemplate({
                Header: getPageHeader(registryNames),
                SearchInputPlaceholder: localize(
                    'AWS.schemas.search.input.placeholder',
                    'Search for schema keyword...'
                ),
                VersionPrefix: localize('AWS.schemas.search.version.prefix', 'Search matched version:'),
                Scripts: loadScripts,
                Libraries: loadLibs,
                Stylesheets: loadStylesheets,
            }),
        })

        view.webview.postMessage({
            command: 'setLocalizedMessages',
            noSchemasFound: localize('AWS.schemas.search.no_results', 'No schemas found'),
            searching: localize('AWS.schemas.search.searching', 'Searching for schemas...'),
            loading: localize('AWS.schemas.search.loading', 'Loading...'),
            select: localize('AWS.schemas.search.select', 'Select a schema'),
        })

        view.webview.onDidReceiveMessage(
            createMessageReceivedFunc({
                registryNames: registryNames,
                schemaClient: client,
                telemetryService: ext.telemetry,
                onPostMessage: message => view.webview.postMessage(message),
            }),
            undefined,
            ext.context.subscriptions
        )
    } catch (err) {
        webviewResult = 'Failed'
        const error = err as Error
        logger.error('Error searching schemas', error)
    } finally {
        // TODO make this telemetry actually record failures
        recordSchemasSearch({ result: webviewResult })
    }
}

export async function getRegistryNames(node: RegistryItemNode | SchemasNode, client: SchemaClient) {
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

export function getPageHeader(registryNames: string[]) {
    if (registryNames.length === 1) {
        return localize('AWS.schemas.search.header.text.singleRegistry', 'Search "{0}" registry', registryNames[0])
    }

    return localize('AWS.schemas.search.header.text.allRegistries', 'Search across all registries')
}

export interface CommandMessage {
    command: string
    keyword?: string
    schemaSummary?: SchemaVersionedSummary
    version?: string
}

export function createMessageReceivedFunc({
    registryNames,
    schemaClient,
    telemetryService,
    ...restParams
}: {
    registryNames: string[]
    schemaClient: SchemaClient
    telemetryService: TelemetryService
    onPostMessage(message: any): Thenable<boolean>
}) {
    return async (message: CommandMessage) => {
        switch (message.command) {
            case 'fetchSchemaContent':
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
                restParams.onPostMessage({
                    command: 'showSchemaContent',
                    results: prettySchema,
                    version: selectedVersion,
                })

                //if versionList is intialized, dropdown needs to be populated
                if (versionList.length !== 0) {
                    restParams.onPostMessage({ command: 'setVersionsDropdown', results: versionList })
                }

                return

            case 'searchSchemas':
                recordSchemasSearch({ result: 'Succeeded' })

                const results = await getSearchResults(schemaClient, registryNames, message.keyword!)

                restParams.onPostMessage({
                    command: 'showSearchSchemaList',
                    results: results,
                    resultsNotFound: results.length === 0,
                })

                return

            case 'downloadCodeBindings':
                const schemaItem: Schemas.SchemaSummary = {
                    SchemaName: getSchemaNameFromTitle(message.schemaSummary!.Title),
                }
                const schemaItemNode = new SchemaItemNode(
                    schemaItem,
                    schemaClient,
                    message.schemaSummary!.RegistryName!
                )
                await downloadSchemaItemCode(schemaItemNode)

                return

            default:
                throw new Error(`Search webview command ${message.command} is invalid`)
        }
    }
}

interface SchemaVersionedSummary {
    RegistryName: string
    Title: string
    VersionList: string[]
}

export async function getSearchListForSingleRegistry(
    schemaClient: SchemaClient,
    registryName: string,
    keyword: string,
    prefix: string = ''
) {
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

export async function getSearchResults(schemaClient: SchemaClient, registries: string[], keyword: string) {
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
