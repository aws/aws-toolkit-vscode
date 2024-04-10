// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {Store} from "vuex";
import {IdcInfo, State} from "./q-ui";
import {Region} from "./model";

export class IdeClient {
    constructor(private readonly store: Store<State>) {}

    updateStage(stage: 'START' | 'SSO_FORM' | 'CONNECTED' | 'AUTHENTICATING' | 'AWS_PROFILE') {
        console.log("update vue State")
        this.store.commit('setStage', stage)
    }

    updateSsoRegions(regions: Region[]) {
        console.log(regions)
        this.store.commit('setSsoRegions', regions)
    }

    updateAuthorization(code: string) {
        console.log('authorization code: ', code)
        this.store.commit('setAuthorizationCode', code)
    }

    updateLastLoginIdcInfo(idcInfo: IdcInfo) {
        this.store.commit('setLastLoginIdcInfo', idcInfo)
    }

    reset() {
        this.store.commit('reset')
    }

    cancelLogin(): void {
        this.reset()
        window.ideApi.postMessage({ command: 'cancelLogin' })
    }
}
