/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getPortPromise } from 'portfinder'

export async function getStartPort(port: number = 5858): Promise<number> {
    return getPortPromise({ port: port })
}
