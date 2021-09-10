/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// temporary, we should be able to generate these entry point files from components
import { createApp } from 'vue'
import component from './samInvokeComponent.vue'
const app = createApp(component)
app.mount('#vue-app')
