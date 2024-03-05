/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import supportedResources = require('./supported_resources.json')

export const memoizedGetResourceTypes = memoize(getResourceTypes)

export function getResourceTypes(resources: any = supportedResources): Map<string, ResourceTypeMetadata> {
    const typesNames = Object.keys(resources)
    const resourceTypes = new Map<string, ResourceTypeMetadata>()
    for (const typeName of typesNames) {
        const metadata = resources[typeName as keyof typeof resources] as ResourceTypeMetadata
        if (metadata.operations?.includes('LIST')) {
            resourceTypes.set(typeName, metadata)
        }
    }
    return resourceTypes
}

function memoize<F extends (...args: any[]) => R, R>(fn: F): F {
    const store: { [key: string]: R } = {}
    return ((...args) => (store[JSON.stringify(args)] ??= fn(...args))) as F
}

export interface ResourceTypeMetadata {
    [x: string]: any
    operations: string[]
    documentation: string
    available: boolean
}
