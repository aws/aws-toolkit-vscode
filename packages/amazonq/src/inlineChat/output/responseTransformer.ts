/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from 'aws-core-vscode/shared'
import { decode } from 'he'

export function responseTransformer(response: string): string | undefined {
    try {
        return decode(response)
    } catch (err) {
        if (err instanceof Error) {
            getLogger().error(err)
        } else {
            getLogger().error(`An unknown error occurred: ${err}`)
        }
        return undefined
    }
}
