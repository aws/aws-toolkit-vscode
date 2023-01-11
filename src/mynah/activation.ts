/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { version, env, EventEmitter, ExtensionContext, window } from 'vscode'
import { registerSearchTriggers } from './triggers'
import { ResultDisplay } from './views/result-display'
import { IdentityStore } from './stores/identityStore'

import { OnDidOpenTextDocumentNotificationsProcessor } from './triggers/notifications/documentProcessor'
import { v4 as uuid } from 'uuid'

import { SearchHistoryStore } from './stores/searchHistoryStore'
import { PanelStore } from './stores/panelStore'
import { SearchHistoryDisplay } from './views/search-history-display'
import { AutocompleteDisplay } from './views/autocomplete-display'
import { DiagnosticErrorListener } from './telemetry/diagnostic-error-listener'
import { LiveSearchDisplay } from './views/live-search'
import * as vs from 'vscode'
import { NotificationInfoStore } from './stores/notificationsInfoStore'
import { mynahSelectedCodeDecorator } from './decorations/selectedCode'
import { SearchOutput } from './models/model'
import { HeartbeatListener } from './telemetry/heartbeat-listener'
import { FileEditListener } from './telemetry/file-edit-listener'
import { telemetry } from '../shared/telemetry/telemetry'
import * as mynahClient from './client/mynah'
import * as AutocompleteClient from './autocomplete-client/autocomplete'
import { TelemetryClient, TelemetryClientSession } from './telemetry/telemetry/client'
import { IdentityManagerFactory } from './telemetry/identity/factory'
import { TelemetryClientFactory } from './telemetry/telemetry/factory'
import { MynahClientType, TelemetryEventName } from './telemetry/telemetry/types'
import { extensionVersion } from '../shared/vscode/env'

let telemetryClient: TelemetryClient

let heartbeatListener: HeartbeatListener

const DIAGNOSTIC_ERROR_TELEMETRY_DELAY_MS = 60_000
const FILE_EDIT_EVENT_BUFFER_DURATION_MS = 300_000

export async function activate(context: ExtensionContext): Promise<void> {
    const mynahChannel = window.createOutputChannel('Mynah')
    mynahChannel.appendLine('Welcome to Mynah')
    context.subscriptions.push(mynahChannel)
    const suggestionsEmitter = new EventEmitter<SearchOutput>()

    const identityStorage = new IdentityStore(context.secrets, context.globalState)
    const identity = identityStorage.get(IdentityStore.IDENTITY_ID_KEY)
    let identityId: string | undefined = await identity
    if (identityId === undefined) {
        identityId = await IdentityManagerFactory.getInstance().getIdentity()
        await identityStorage.store(IdentityStore.IDENTITY_ID_KEY, identityId)
    }
    mynahChannel.appendLine('Identity id: ' + identityId)
    telemetryClient = TelemetryClientFactory.getInstance({
        environmentName: env.appName,
        environmentVersion: version,
        identityId,
        mynahClientType: MynahClientType.MYNAH_VISUAL_STUDIO_CODE,
        mynahClientVersion: extensionVersion,
    })
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

    const telemetrySession: TelemetryClientSession = telemetryClient.newSession(uuid())

    const onDidOpenTextDocumentNotificationsProcessor = new OnDidOpenTextDocumentNotificationsProcessor(
        notificationInfoStore,
        telemetrySession
    )

    vs.workspace.onDidOpenTextDocument(async d => {
        await onDidOpenTextDocumentNotificationsProcessor.process(d)
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
    const input = registerSearchTriggers(
        context,
        suggestionsEmitter,
        telemetrySession,
        liveSearchDisplay,
        notificationInfoStore,
        client
    )
    const resultDisplay = new ResultDisplay(context, {
        input,
        client: telemetryClient,
        searchHistoryStore,
        panelStore,
        searchHistoryDisplay,
        liveSearchDisplay,
        autocompleteDisplay,
    })
    telemetrySession.recordEvent(TelemetryEventName.ACTIVATE)
    telemetry.mynah_activate.emit()

    suggestionsEmitter.event(output => {
        resultDisplay.showSearchSuggestions(output)
    })

    const diagnosticErrorListener = new DiagnosticErrorListener(DIAGNOSTIC_ERROR_TELEMETRY_DELAY_MS, telemetrySession)
    diagnosticErrorListener.activate()
    const fileEditListener = new FileEditListener(FILE_EDIT_EVENT_BUFFER_DURATION_MS, telemetrySession)
    fileEditListener.activate()
    heartbeatListener = new HeartbeatListener(telemetrySession)
}

export const deactivate = async (context: ExtensionContext): Promise<void> => {
    if (telemetryClient !== undefined) {
        telemetryClient.newSession(uuid()).recordEvent(TelemetryEventName.DEACTIVATE)
    }

    if (heartbeatListener !== undefined) {
        heartbeatListener.dispose()
    }
}
