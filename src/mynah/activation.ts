/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter, ExtensionContext, window } from 'vscode'
import { registerSearchTriggers } from './triggers'
import { ResultDisplay } from './views/result-display'

import { OnDidOpenDocNotificationsProcessor } from './triggers/notifications/documentProcessor'

import { SearchHistoryStore } from './stores/searchHistoryStore'
import { PanelStore } from './stores/panelStore'
import { SearchHistoryDisplay } from './views/search-history-display'
import { AutocompleteDisplay } from './views/autocomplete-display'
import { LiveSearchDisplay } from './views/live-search'
import * as vs from 'vscode'
import { NotificationInfoStore } from './stores/notificationsInfoStore'
import { mynahSelectedCodeDecorator } from './decorations/selectedCode'
import { MynahInstallationStoreKey, SearchOutput } from './models/model'
import { HeartbeatListener } from './telemetry/heartbeat-listener'
import { telemetry } from '../shared/telemetry/telemetry'
import * as mynahClient from './client/mynah'
import * as AutocompleteClient from './autocomplete-client/autocomplete'
import { ExtensionMetadata, ExtensionState, TriggerInteractionType } from './telemetry/telemetry-metadata'

let heartbeatListener: HeartbeatListener

export async function activate(context: ExtensionContext): Promise<void> {
    const mynahChannel = window.createOutputChannel('Mynah')
    mynahChannel.appendLine('Welcome to Mynah')
    context.subscriptions.push(mynahChannel)
    const suggestionsEmitter = new EventEmitter<SearchOutput>()

    const searchHistoryStore = new SearchHistoryStore(context.globalState, context.workspaceState)
    const panelStore = new PanelStore()
    const notificationInfoStore = new NotificationInfoStore(context.globalState, context.workspaceState)

    const searchHistoryDisplay = new SearchHistoryDisplay({
        searchHistoryStore,
        panelStore,
    })

    const autocompleteClient = new AutocompleteClient.DefaultAutocompleteClient()
    const autocompleteDisplay = new AutocompleteDisplay({
        client: autocompleteClient,
        panelStore,
    })

    const onDidOpenDocNotificationsProcessor = new OnDidOpenDocNotificationsProcessor(notificationInfoStore)

    vs.workspace.onDidOpenTextDocument(async d => {
        await onDidOpenDocNotificationsProcessor.process(d)
    })

    vs.workspace.onDidChangeTextDocument(d => {
        vs.window.activeTextEditor?.setDecorations(mynahSelectedCodeDecorator, [])
    })

    const liveSearchDisplay = new LiveSearchDisplay(panelStore, context.globalState)
    const implicitSearchConfig = vs.workspace.getConfiguration('aws.mynah')
    if (implicitSearchConfig.has('enableImplicitSearch') && implicitSearchConfig.get('enableImplicitSearch', false)) {
        await liveSearchDisplay.enableLiveSearch()
    } else {
        await liveSearchDisplay.disableLiveSearch()
    }

    const client = new mynahClient.DefaultMynahSearchClient()
    const input = registerSearchTriggers(context, suggestionsEmitter, liveSearchDisplay, notificationInfoStore, client)
    const resultDisplay = new ResultDisplay(context, {
        input,
        searchHistoryStore,
        panelStore,
        searchHistoryDisplay,
        liveSearchDisplay,
        autocompleteDisplay,
    })

    if (!context.globalState.get(MynahInstallationStoreKey)) {
        vs.commands.executeCommand('Mynah.show', { inputTrigger: TriggerInteractionType.FIRST_INSTALL })
        context.globalState.update(MynahInstallationStoreKey, true)
    }

    const extensionMetadata: ExtensionMetadata = {
        state: ExtensionState.ACTIVE,
    }
    telemetry.mynah_updateExtensionState.emit({
        mynahContext: JSON.stringify({
            extensionMetadata,
        }),
    })
    suggestionsEmitter.event(output => {
        resultDisplay.showSearchSuggestions(output)
    })

    heartbeatListener = new HeartbeatListener()
}

export const deactivate = async (context: ExtensionContext): Promise<void> => {
    if (heartbeatListener !== undefined) {
        heartbeatListener.dispose()
    }
    const extensionMetadata: ExtensionMetadata = {
        state: ExtensionState.INACTIVE,
    }
    telemetry.mynah_updateExtensionState.emit({
        mynahContext: JSON.stringify({
            extensionMetadata,
        }),
    })
}
