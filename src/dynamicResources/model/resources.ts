/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import supportedResources = require('./supported_resources.json')

let resourceTypes: Map<string, ResourceTypeMetadata>

export function getResourceTypes(resources: any = supportedResources): Map<string, ResourceTypeMetadata> {
    if (!resourceTypes) {
        const typesNames = Object.keys(resources)
        const types = new Map<string, ResourceTypeMetadata>()
        for (const typeName of typesNames) {
            const metadata = resources[typeName as keyof typeof resources] as ResourceTypeMetadata
            if (metadata.operations?.includes('LIST')) {
                types.set(typeName, metadata)
            }
        }
        resourceTypes = types
    }
    return resourceTypes
}

export interface ResourceTypeMetadata {
    [x: string]: any
    operations: string[]
    documentation: string
    available: boolean
}
