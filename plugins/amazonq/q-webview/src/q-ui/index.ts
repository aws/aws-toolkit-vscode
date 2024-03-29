// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// eslint-disable-next-line header/header
import { createApp } from 'vue'
import {createStore, Store} from 'vuex'
import HelloWorld from './components/root.vue'

export interface State {}

declare module '@vue/runtime-core' {
    interface ComponentCustomProperties {
        $store: Store<State>
    }
}

const app = createApp(HelloWorld)
const store = createStore<State>({
    state: {},
    getters: {},
    mutations: {},
    actions: {},
    modules: {},
})
app.use(store).mount('#app')
