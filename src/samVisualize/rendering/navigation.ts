/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getLogger } from '../../shared/logger/logger'
import * as yaml from 'yaml'
/**
 * Maps a resource name to the start and end positions of its definition in a template
 */
export type ResourceLineMap = {
    [resourceName: string]: { start: number; end: number }
}
/**
 * Maps all the resources in a given CFN template to the start and end line positions of their definition
 * @param textDocument A string representing the contents of a CFN yaml template.
 * @returns A ResourceLineMap containing all the resources in the given template
 */
export function generateResourceLineMap(cfnTemplate: string): ResourceLineMap | undefined {
    const lineMap: ResourceLineMap = {}
    const contents = yaml.parseDocument(cfnTemplate).contents

    // This check is necessary because yaml.parseDocument could return a Scalar or just null
    // However, it will always return a YAMLMap for a YAML template that follows Template Anatomy
    // See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
    let resources
    if (contents && 'items' in contents) {
        for (const pair of contents.items) {
            if (pair.key.value === 'Resources') {
                // All keys under the 'Resources' key
                resources = pair.value.items
            }
        }
    }
    // If the template does not follow Template Anatomy, and we cannot find 'Resources'
    if (!resources) {
        const characterLimit = 25
        getLogger().error(
            `SAM Visualize: Failed to locate a 'Resources' key in template "${cfnTemplate.substr(
                0,
                characterLimit
            )}"... Ensure the template follows Template Anatomy: 0%`
        )
        return undefined
    }
    for (const resource of resources) {
        // resource.key.range[0] because we want the START position of the key (the resource name)
        const start = resource.key.range[0]
        // resource.value.range[1] because we want the END position of the body under the resource key
        const end = resource.value.range[1]
        // resource.key.value is the resource name
        lineMap[resource.key.value] = { start, end }
    }
    return lineMap
}
