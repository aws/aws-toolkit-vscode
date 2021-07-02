/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CfnResourceKeys, ConstructProps, ConstructTreeEntity } from './types'

/**
 * Determines the type of the construct if it exists
 *
 * @param construct CDK construct
 * @param defaultValue - value to return if type cannot be determined
 */
export function getTypeAttributeOrDefault(construct: ConstructTreeEntity, defaultValue: string): string {
    const attributes = construct.attributes
    if (attributes && attributes[CfnResourceKeys.TYPE]) {
        return attributes[CfnResourceKeys.TYPE] as string
    }

    return defaultValue
}

/**
 * Determines the props of a construct if they exist
 *
 * @param construct CDK construct
 */
export function getProperties(construct: ConstructTreeEntity): ConstructProps | undefined {
    const attributes = construct.attributes
    if (attributes && attributes[CfnResourceKeys.PROPS]) {
        return attributes[CfnResourceKeys.PROPS] as ConstructProps
    }

    return undefined
}

/**
 * Some constructs encoded in the Tree do not need to be included in the design-time view
 * i.e. the `Tree` construct should not be encoded in tree.json and will be removed
 *
 * @param construct CDK construct
 */
export function includeConstructInTree(construct: ConstructTreeEntity): boolean {
    if (construct.id === 'Tree' && construct.path === 'Tree') {
        return false
    }

    return true
}

/**
 * Determines the display label for a construct
 *
 * @param construct CDK construct
 */
export function getDisplayLabel(construct: ConstructTreeEntity): string {
    const type: string = getTypeAttributeOrDefault(construct, '')

    // the 'Resource' label has been a point of confusion so also including the type
    if (construct.id === 'Resource' && type) {
        return `${construct.id} (${type})`
    }

    return construct.id
}
