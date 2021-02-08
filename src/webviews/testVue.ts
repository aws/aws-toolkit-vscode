/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import defineComponent from 'vue'

// interface Book {
//   title: string
//   author: string
//   year: number
// }

export const Component = new defineComponent({
    render(h) {
        return h('div', 'hello world')
    },
    el: '#vueApp',
})
