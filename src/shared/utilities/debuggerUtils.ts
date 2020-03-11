/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getPortPromise } from 'portfinder'

export async function getStartPort(): Promise<number> {
    // should we let the user configure the starting port?
    return getPortPromise({ port: 5858 })
}
