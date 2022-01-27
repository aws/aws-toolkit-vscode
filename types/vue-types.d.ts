/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ambient declaration that describes what '.vue' files export.
 *
 * Typescript is unable to parse Vue SFCs, so cannot populate the template types.
 */
declare module '*.vue' {
    import { Component } from 'vue'
    const Component: Component
    export default Component
}
