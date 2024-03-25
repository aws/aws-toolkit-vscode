/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module is run within the webview, and will mount the Vue app.
 */

import { createApp } from 'vue'
import component from '../root.vue'

const create = () =>
    createApp(component, {
        app: 'AMAZONQ',
    })
const app = create()

app.mount('#vue-app')
window.addEventListener('remount', () => {
    app.unmount()
    create().mount('#vue-app')
})
