/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger'

// Parses the endpoints.json file into a usable structure

export interface Endpoints {
    partitions: Partition[]
}

export interface Partition {
    dnsSuffix: string
    id: string
    name: string
    regions: Region[]
    services: Service[]
}

export interface Region {
    /**
     * Region Code
     */
    id: string
    /**
     * Friendly Name
     */
    name: string
}

export interface Service {
    id: string
    endpoints: ServiceEndpoints[]
    isRegionalized?: boolean
    partitionEndpoint?: string
}

export interface ServiceEndpoints {
    regionId: string
    data: any
}

// --- JSON Serialization Structures ---
interface ManifestEndpoints {
    partitions?: ManifestPartition[]
}

interface JsonStringMap<T> {
    [key: string]: T
}

interface ManifestPartition {
    dnsSuffix: string
    partition: string
    partitionName: string
    regions?: JsonStringMap<ManifestRegion>
    services?: JsonStringMap<ManifestService>
}

interface ManifestRegion {
    description: string
}

interface ManifestService {
    endpoints?: JsonStringMap<any>
    isRegionalized?: boolean
    partitionEndpoint?: string
}

// --- END JSON Serialization Structures ---

export function loadEndpoints(json: string): Endpoints | undefined {
    try {
        const manifestEndpoints = JSON.parse(json) as ManifestEndpoints

        return {
            partitions: manifestEndpoints.partitions?.map(convertToPartition) ?? [],
        }
    } catch (err) {
        const logger = getLogger()
        logger.error('Failed to load endpoints manifest: %O', err as Error)
        logger.verbose('endpoints payload was: %s', json)

        return undefined
    }
}

function convertToPartition(partition: ManifestPartition): Partition {
    return {
        dnsSuffix: partition.dnsSuffix,
        id: partition.partition,
        name: partition.partitionName,
        regions: convertJsonMap(partition.regions, convertToRegion),
        services: convertJsonMap(partition.services, convertToService),
    }
}

function convertJsonMap<TIn, TOut>(
    jsonMap: JsonStringMap<TIn> | undefined,
    convertObject: (id: string, obj: TIn) => TOut
): TOut[] {
    if (!jsonMap) {
        return []
    }

    return Object.keys(jsonMap).map(id => convertObject(id, jsonMap[id]))
}

function convertToRegion(id: string, region: ManifestRegion): Region {
    return {
        id: id,
        name: region.description,
    }
}

function convertToService(id: string, service: ManifestService): Service {
    return {
        id: id,
        isRegionalized: service.isRegionalized,
        partitionEndpoint: service.partitionEndpoint,
        endpoints: convertJsonMap(service.endpoints, convertToServiceEndpoint),
    }
}

function convertToServiceEndpoint(id: string, data: any): ServiceEndpoints {
    return {
        regionId: id,
        data: data,
    }
}
