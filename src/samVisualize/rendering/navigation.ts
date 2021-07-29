/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as yaml from 'yaml'
/**
 * Maps a resource name to the line number in the template in which it is defined
 */
export type ResourceLineMap = {
    [index: string]: number
}
/**
 * Maps all the resources in a given CFN template to the line numbers at which they are declared
 * @param textDocument A TextDocument containing a CFN template from which we want to extract a ResourceLineMap
 * @returns A ResourceLineMap containing all the resources in the given template
 */
export function generateResourceLineMap(cfnTemplate: vscode.TextDocument): ResourceLineMap | undefined {
    const lineMap: ResourceLineMap = {}
    const contents = yaml.parseDocument(cfnTemplate.getText()).contents

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
        return undefined
    }
    for (const resource of resources) {
        // resource.key.range[0] because we want the START position of the key (the resource name)
        const line = cfnTemplate.positionAt(resource.key.range[0]).line
        // resource.key.value is the resource name
        lineMap[resource.key.value] = line
    }
    return lineMap
}
