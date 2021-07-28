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
export function generateResourceLineMap(cfnTemplate: vscode.TextDocument): ResourceLineMap {
    const lineMap: ResourceLineMap = {}
    const contents = yaml.parseDocument(cfnTemplate.getText()).contents

    // This check is necessary because yaml.parseDocument could return a Scalar or just null
    if (contents && 'items' in contents) {
        for (const pair of contents.items) {
            if (pair.key.value === 'Resources') {
                for (const resource of pair.value.items) {
                    const line = cfnTemplate.positionAt(resource.key.range[0]).line
                    lineMap[resource.key.value] = line
                }
            }
        }
    }
    return lineMap
}
