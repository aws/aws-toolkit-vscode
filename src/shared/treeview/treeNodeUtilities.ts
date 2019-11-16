/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger/logger'
import { AWSTreeNodeBase } from './nodes/awsTreeNodeBase'

/**
 * Produces a list of child nodes using handlers to consistently populate the
 * list when errors occur or if the list would otherwise be empty.
 */
export async function makeChildrenNodes(parameters: {
    getChildNodes(): Promise<AWSTreeNodeBase[]>
    getNoChildrenPlaceholderNode?(): Promise<AWSTreeNodeBase>
    getErrorNode(error: Error): Promise<AWSTreeNodeBase>
    sort?(a: AWSTreeNodeBase, b: AWSTreeNodeBase): number
}): Promise<AWSTreeNodeBase[]> {
    let childNodes: AWSTreeNodeBase[] = []
    try {
        childNodes.push(...(await parameters.getChildNodes()))

        if (childNodes.length === 0 && parameters.getNoChildrenPlaceholderNode) {
            childNodes.push(await parameters.getNoChildrenPlaceholderNode())
        }

        if (parameters.sort) {
            childNodes = childNodes.sort((a, b) => parameters.sort!(a, b))
        }
    } catch (err) {
        const error = err as Error
        getLogger().error(`Error while getting Child nodes: ${error.message}`)

        childNodes.push(await parameters.getErrorNode(error))
    }

    return childNodes
}
