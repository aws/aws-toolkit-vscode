/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as yaml from 'yaml'
import * as _ from 'lodash'
/**
 * Maps a resource name to the start and end positions of its definition in a template
 */
export type ResourceLineMap = {
    [resourceName: string]: { start: number; end: number }
}
/**
 * Maps all the resources in a given CFN template to the start and end positions of their definition
 * @param textDocument A string representing the contents of a CFN yaml template.
 * @returns A ResourceLineMap containing all the resources in the given template, or an empty map if the template is invalid
 */
export function generateResourceLineMap(cfnTemplate: string): ResourceLineMap {
    const lineMap: ResourceLineMap = {}
    const contents = yaml.parseDocument(cfnTemplate).contents

    // This check is necessary because yaml.parseDocument could return a Scalar or just null
    // However, it will always return a YAMLMap for a YAML template that follows Template Anatomy
    // See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
    let resources
    if (contents && 'items' in contents) {
        for (const pair of contents.items) {
            if (pair.key.value === 'Resources') {
                // All key/value pairs under the 'Resources' key
                const resourcesValue = pair.value

                // If the resources key does not point to a map object
                // Note: Map objects can either be typed 'MAP' or 'FLOW_MAP' by yaml library, depending on format (eg. JSON vs YAML)
                if (!resourcesValue || (resourcesValue.type !== 'MAP' && resourcesValue.type !== 'FLOW_MAP')) {
                    return {}
                }
                resources = resourcesValue.items
            }
        }
    }
    // If the template does not follow Template Anatomy, and we cannot find 'Resources'
    if (!resources) {
        return {}
    }
    for (const resource of resources) {
        // A particular resource is missing a value,
        // or points to something that is not a map (eg. string, number, or list)
        // Note: Map objects can either be typed 'MAP' or 'FLOW_MAP' by yaml library, depending on format (eg. JSON vs YAML)
        if (!resource.value || (resource.value.type !== 'MAP' && resource.value.type !== 'FLOW_MAP')) {
            return {}
        }
        // resource.key.range[0] because we want the START position of the key (the resource name)
        const start = resource.key.range[0]
        // resource.value.range[1] because we want the END position of the body under the resource key
        const end = resource.value.range[1]
        // resource.key.value is the resource name
        lineMap[resource.key.value] = { start, end }
    }
    return lineMap
}
