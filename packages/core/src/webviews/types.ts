/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { DefineComponent, defineComponent } from 'vue'

/**
 * This is the type of the output of {@link defineComponent}.
 *
 * For exmaple, this can be used to represent multiple components that
 * extend a base component.
 */
export type DefinedComponent = DefineComponent<any, any, any, any, any, any, any, any, any, any>
