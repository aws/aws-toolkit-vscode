/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Vue from 'vue'
import { WebviewClientFactory, GlobalProtocol } from '../client'

/**
 * Mixin for instrumenting components for testing.
 */
const reporter: Vue.ComponentOptionsMixin = {
    created() {
        if (this.$data === undefined) {
            return
        }

        const id = this.$options.id ?? this.id ?? this.$options._unid
        const name = this.$options.name ?? this.name
        const isValidTarget = (target?: string) => !target || target === name || target === id
        const format = (message: string) => `${name ?? 'unknown'} (${id ?? 'unknown'}): ${message}`
        const client = WebviewClientFactory.create<GlobalProtocol>()

        client.$inspect(event => {
            if (!isValidTarget(event.target)) {
                console.log(format(`Ignoring inspection request for ${event.target}`))
                return
            }

            client.$report({ name, id, data: this.$data }).catch(err => {
                console.warn(format(`Failed to send $inspect response: ${err.message}`))
            })
        })

        client.$execute(async event => {
            if (!isValidTarget(event.target)) {
                console.log(format(`Ignoring execution request for ${event.target}`))
                return
            }

            const method = this[event.method]

            if (typeof method !== 'function') {
                console.warn(format(`Method "${method}" was ${!method ? 'undefined or null' : typeof method}`))
                return
            }

            // Not going to worry about sending back whatever the function returns
            try {
                await method.call(this, ...event.args)
                await client.$report({ name, id, data: this.$data })
            } catch (err) {
                console.warn(format(`Failed to send $execute response: ${(err as Error).message}`))
            }
        })
    },
}

export default reporter
