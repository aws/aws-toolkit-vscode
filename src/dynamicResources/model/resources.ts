/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import supportedResources = require('./supported_resources.json')

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

export interface ResourceTypeMetadata {
    [x: string]: any
    operations: string[]
    documentation: string
    available: boolean
}
