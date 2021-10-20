/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewApi } from 'vscode-webview'
import * as Vue from 'vue'
declare const vscode: WebviewApi<{ [key: string]: any }>

/* Keep track of registered IDs to warn if duplicates appears */
const _unids = new Set<string>()

/**
 * A mixin for saving component data state.
 *
 * This is added prior to the component's own create method. This will save the component state anytime
 * something in 'data' changes, even for deeply nested properties. Keep in mind that all components share
 * a single global state object; we must assign a globally unique identifier to components to correctly
 * recover state upon refresh.
 *
 * Components with duplicated IDs will not be able to recover state.
 */
const saveData: Vue.ComponentOptionsMixin = {
    created() {
        if (this.$data === undefined) {
            return
        }

        // TODO: add error handling, logs, etc.
        this.$options._count = ((this.$options._count as number | undefined) ?? 0) + 1
        const unid =
            this.id ?? `${this.$options.vscodeId ?? this.name ?? `DEFAULT-${_unids.size}`}-${this.$options._count}`
        this.$options._unid = unid

        if (_unids.has(unid)) {
            console.warn(`Component "${unid}" already exists. State-saving functionality will be disabled.`)
            return
        }

        _unids.add(unid)
        const old = (vscode.getState() ?? {})[unid] ?? {}

        Object.keys(this.$data).forEach(k => {
            this.$data[k] = old[k] ?? this.$data[k]
        })

        Object.keys(this.$data).forEach(k => {
            this.$watch(
                k,
                (v: any) => {
                    const globalState = vscode.getState() ?? {}
                    const componentState = Object.assign(globalState[unid] ?? {}, {
                        [k]: JSON.parse(JSON.stringify(v)),
                    })
                    vscode.setState(Object.assign(globalState, { [unid]: componentState }))
                },
                { deep: true }
            )
        })
    },
}

declare module '@vue/runtime-core' {
    export interface ComponentCustomOptions {
        // TODO: might not even need this, generating IDs works for the majority of use-cases
        /**
         * ID associated with the component to save its internal state.
         *
         * This should be unique, otherwise state may get overwritten.
         */
        vscodeId?: string
    }
    // TODO: add custom property to clear component state based off id
    // can we just check for when a component is unmounted?
}

export default saveData
