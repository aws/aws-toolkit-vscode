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

        const format = (message: string) =>
            console.log(`${this.name ?? 'unknown'} (${this.id ?? 'unknown'}): ${message}`)
        const client = WebviewClientFactory.create<GlobalProtocol>()

        client.$inspect(event => {
            if (this.name && event.target && event.target !== this.name) {
                console.log(format(`Ignoring inspection request for ${event.target}`))
                return
            }

            // There is no consistent scheme for determining a name.
            // Components should set names and/or ids as-needed.
            client.$report({ name: this.name, id: this.id, data: this.$data }).catch(err => {
                console.warn(format(`Failed to send $inspect response: ${err.message}`))
            })
        })
    },
}

export default reporter
