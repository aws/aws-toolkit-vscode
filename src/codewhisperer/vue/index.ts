/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createApp } from 'vue'
import component from './root.vue'

const create = () => createApp(component)
const app = create()
app.mount('#vue-app')

window.addEventListener('remount', () => {
    app.unmount()
    create().mount('#vue-app')
})
