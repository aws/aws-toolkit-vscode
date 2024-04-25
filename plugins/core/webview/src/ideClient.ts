// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {Store} from "vuex";
import {IdcInfo, Region, Stage, State, BrowserSetupData, AwsBearerTokenConnection} from "./model";

export class IdeClient {
    constructor(private readonly store: Store<State>) {}

    // TODO: design and improve the API here

    prepareUi(state: BrowserSetupData) {
        console.log('browser is preparing UI with state ', state)
        this.store.commit('setStage', state.stage)
        this.store.commit('setSsoRegions', state.regions)
        this.updateLastLoginIdcInfo(state.idcInfo)
        this.store.commit("setCancellable", state.cancellable)
        this.store.commit("setFeature", state.feature)

        const existConnections = state.existConnections.map(it => {
            return {
                sessionName: it.sessionName,
                startUrl: it.startUrl,
                region: it.region,
                scopes: it.scopes,
                id: it.id
            }
        })

        this.store.commit("setExistingConnections", existConnections)
        this.updateAuthorization(undefined)
    }

    updateAuthorization(code: string | undefined) {
        this.store.commit('setAuthorizationCode', code)
    }

    updateLastLoginIdcInfo(idcInfo: IdcInfo) {
        this.store.commit('setLastLoginIdcInfo', idcInfo)
    }

    reset() {
        this.store.commit('reset')
    }

    cancelLogin(): void {
        // this.reset()
        this.store.commit('setStage', 'START')
        window.ideApi.postMessage({ command: 'cancelLogin' })
    }
}
