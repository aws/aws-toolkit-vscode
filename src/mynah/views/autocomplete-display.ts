/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AutocompleteItem } from '../ui/components/search-block/autocomplete-content'
import { PanelStore } from '../stores/panelStore'
import { QueryContext } from '../models/model'
import { getAutocompleteSuggestions } from '../service/autocomplete'
import { DefaultAutocompleteClient } from '../autocomplete-client/autocomplete'

export interface AutocompleteQuery {
    input: string
    queryContext: QueryContext
    panelId: string
}

export interface AutocompleteDisplayProps {
    panelStore: PanelStore
    client: DefaultAutocompleteClient
}

export class AutocompleteDisplay {
    private readonly panelStore: PanelStore
    private readonly client: DefaultAutocompleteClient

    constructor(props: AutocompleteDisplayProps) {
        this.panelStore = props.panelStore
        this.client = props.client
    }

    public async getAutocomplete(query: AutocompleteQuery): Promise<void> {
        const panelId = query.panelId
        const input = query.input
        const panel = this.panelStore.getPanel(panelId)
        if (panel === undefined || input === undefined) {
            return
        }
        getAutocompleteSuggestions(this.client, query)
            .then(async (suggestions: AutocompleteItem[]) => {
                await panel.webviewPanel.webview.postMessage(
                    JSON.stringify({
                        autocompleteList: suggestions,
                    })
                )
            })
            .catch((error: Error) => {
                console.error('An error occurred when retreiving autocomplete suggestions:', error)
            })
    }
}
