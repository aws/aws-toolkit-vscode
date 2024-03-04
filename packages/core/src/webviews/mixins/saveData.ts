/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewApi } from 'vscode-webview'
import * as Vue from 'vue'
declare const vscode: WebviewApi<{ [key: string]: any }>

/* Keep track of registered IDs to warn if duplicates appears */
const _unids = new Set<string>()

// Upon remounting we need to clear whatever IDs we have stored
window.addEventListener('remount', () => _unids.clear())

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
        const state = vscode.getState() ?? {}

        // TODO: add error handling, logs, etc.
        this.$options._count = ((this.$options._count as number | undefined) ?? 0) + 1
        const unid = this.id ?? `${this.name ?? `DEFAULT-${_unids.size}`}-${this.$options._count}`
        this.$options._unid = unid

        if (_unids.has(unid)) {
            console.warn(`Component "${unid}" already exists. State-saving functionality will be disabled.`)
            return
        }

        _unids.add(unid)
        const old = state[unid] ?? {}

        Object.keys(this.$data).forEach(k => {
            this.$data[k] = old[k] ?? this.$data[k]
        })

        Object.keys(this.$data).forEach(k => {
            this.$watch(
                k,
                (v: unknown) => {
                    const globalState = vscode.getState() ?? {}
                    const componentState = Object.assign(globalState[unid] ?? {}, {
                        [k]: v !== undefined ? JSON.parse(JSON.stringify(v)) : undefined,
                    })
                    vscode.setState(Object.assign(globalState, { [unid]: componentState }))
                },
                { deep: true }
            )
        })
    },
}

export default saveData
