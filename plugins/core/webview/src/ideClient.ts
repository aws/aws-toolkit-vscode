// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {Store} from "vuex";
import {IdcInfo, Region, Stage, State} from "./model";

export class IdeClient {
    constructor(private readonly store: Store<State>) {}

    // TODO: design and improve the API here

    prepareUi(state: { stage: Stage, regions: Region[], idcInfo: IdcInfo, cancellable: boolean, feature: string }) {
        console.log('browser is preparing UI with state ', state)
        this.store.commit('setStage', state.stage)
        this.store.commit('setSsoRegions', state.regions)
        this.updateLastLoginIdcInfo(state.idcInfo)
        this.store.commit("setCancellable", state.cancellable)
        this.store.commit("setFeature", state.feature)
    }

    updateAuthorization(code: string) {
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
