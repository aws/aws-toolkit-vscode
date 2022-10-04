/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'
import { DebugErrorSearch } from './debugErrorSearch'
import { TerminalLinkSearch } from './terminalLinkSearch'
import { ManualInputSearch } from './manualInputSearch'
import { Event, EventEmitter, ExtensionContext } from 'vscode'
import { DiagnosticsSearchProvider } from './diagnosticsSearchProvider'
import { TelemetryClientSession } from '../telemetry/telemetry/client'
import { LiveSearchDisplay } from '../views/live-search'
import { NotificationInfoStore } from '../stores/notificationsInfoStore'
import { Query, SearchInput, SearchOutput } from '../models/model'
import { getSearchSuggestions } from '../service/search'
import { DefaultMynahSearchClient } from '../client/mynah'
export { extractLanguageAndOtherContext } from './languages'

export const registerSearchTriggers = (
    context: ExtensionContext,
    suggestionsEmitter: EventEmitter<SearchOutput>,
    telemetrySession: TelemetryClientSession,
    liveSearchDisplay: LiveSearchDisplay,
    notificationInfoStore: NotificationInfoStore,
    mynahClient: DefaultMynahSearchClient
): SearchInput => {
    const queryEmitter = new EventEmitter<Query>()

    const input = registerTriggers(context, queryEmitter, telemetrySession, liveSearchDisplay, notificationInfoStore)

    registerSearchSources(queryEmitter.event, suggestionsEmitter, mynahClient)
    return input
}

const registerSearchSources = (
    onQuery: Event<Query>,
    suggestionsEmitter: EventEmitter<SearchOutput>,
    mynahClient: DefaultMynahSearchClient
): void => {
    onQuery(query => {
        const searchOutput: SearchOutput = {
            suggestions: getSearchSuggestions(mynahClient, query),
            query,
        }
        suggestionsEmitter.fire(searchOutput)
    })
}

const registerTriggers = (
    context: ExtensionContext,
    queryEmitter: EventEmitter<Query>,
    telemetrySession: TelemetryClientSession,
    liveSearchDisplay: LiveSearchDisplay,
    notificationInfoStore: NotificationInfoStore
): SearchInput => {
    // TODO: Move all command registration into class/helper that does this.
    // Don't register commands at arbitrary locations.
    //
    // This will also force us to construct the object dependency tree in a more
    // sane manner.
    vs.commands.registerCommand('Mynah.search', (query: Query) => {
        queryEmitter.fire(query)
    })
    const terminalLinkSearch = new TerminalLinkSearch(
        queryEmitter,
        telemetrySession,
        liveSearchDisplay,
        notificationInfoStore
    )
    terminalLinkSearch.activate(context)

    const debugErrorSearch = new DebugErrorSearch(queryEmitter, telemetrySession, liveSearchDisplay)
    debugErrorSearch.activate(context)

    const diagnosticsSearchProvider = new DiagnosticsSearchProvider()
    diagnosticsSearchProvider.activate()

    const manualInputSearch = new ManualInputSearch(context, queryEmitter, telemetrySession)
    manualInputSearch.activate(context)
    return manualInputSearch
}
