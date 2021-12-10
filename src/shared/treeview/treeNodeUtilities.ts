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
export async function makeChildrenNodes<
    T extends AWSTreeNodeBase,
    P extends AWSTreeNodeBase,
    E extends AWSTreeNodeBase
>(parameters: {
    getChildNodes(): Promise<T[]>
    getNoChildrenPlaceholderNode?(): Promise<P>
    getErrorNode(error: Error, logID: number): Promise<E>
    sort?: (a: T, b: T) => number
}): Promise<T[] | [P] | [E]> {
    try {
        const nodes = await parameters.getChildNodes()

        if (nodes.length === 0 && parameters.getNoChildrenPlaceholderNode) {
            return [await parameters.getNoChildrenPlaceholderNode()]
        }

        if (parameters.sort) {
            nodes.sort((a, b) => parameters.sort!(a, b))
        }

        return nodes
    } catch (err) {
        const error = err as Error
        const logID: number = getLogger().error(error)

        return [await parameters.getErrorNode(error, logID)]
    }
}
