// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// eslint-disable-next-line header/header
import { createApp } from 'vue'
import {createStore, Store} from 'vuex'
import HelloWorld from './components/root.vue'
import {Region, Stage} from "../model";
import {IdeClient} from "../ideClient";

declare global {
    interface Window {
        ideApi: { postMessage: (arg: { command: string } & any) => any }
        ideClient: IdeClient
    }
}

export interface State {
    stage: Stage,
    ssoRegions: Region[],
    authorizationCode: string
}

declare module '@vue/runtime-core' {
    interface ComponentCustomProperties {
        $store: Store<State>
    }
}

const app = createApp(HelloWorld)
const store = createStore<State>({
    state: {
        stage: 'START' as Stage,
        ssoRegions: [] as Region[],
        authorizationCode: ''
    },
    getters: {},
    mutations: {
        setStage(state: State, stage: Stage) {
            state.stage = stage
        },
        setSsoRegions(state: State, regions: Region[]) {
            state.ssoRegions = regions
        },
        setAuthorizationCode(state: State, code: string) {
            state.authorizationCode = code
        },
        reset(state: State) {
            state.stage = 'START'
            state.ssoRegions = []
            state.authorizationCode = ''
        }
    },
    actions: {},
    modules: {},
})

window.ideClient = new IdeClient(store)
app.use(store).mount('#app')
