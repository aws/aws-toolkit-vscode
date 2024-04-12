// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// eslint-disable-next-line header/header
import { createApp } from 'vue'
import {createStore, Store} from 'vuex'
import HelloWorld from './components/root.vue'
import {IdcInfo, Region, Stage, State} from "../model";
import {IdeClient} from "../ideClient";
import './assets/common.scss'

const app = createApp(HelloWorld, { app: 'AMAZONQ' })
const store = createStore<State>({
    state: {
        stage: 'START' as Stage,
        ssoRegions: [] as Region[],
        authorizationCode: undefined,
        lastLoginIdcInfo: {
            profileName: '',
            directoryId: '',
            region: '',
        }
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
        setLastLoginIdcInfo(state: State, idcInfo: IdcInfo) {
            console.log('state idc info is updated')
            state.lastLoginIdcInfo.profileName = idcInfo.profileName
            state.lastLoginIdcInfo.directoryId = idcInfo.directoryId
            state.lastLoginIdcInfo.region = idcInfo.region
        },
        reset(state: State) {
            state.stage = 'START'
            state.ssoRegions = []
            state.authorizationCode = undefined
            state.lastLoginIdcInfo = {
                profileName: '',
                directoryId: '',
                region: ''
            }
        }
    },
    actions: {},
    modules: {},
})

window.ideClient = new IdeClient(store)
app.directive('autofocus', {
    // When the bound element is inserted into the DOM...
    mounted: function (el) {
        el.focus();
    }
});
app.use(store).mount('#app')
