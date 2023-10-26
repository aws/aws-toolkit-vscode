/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'

export async function invoke<TInput, TOutput>(client: LambdaClient, arn: string, payload: TInput): Promise<TOutput> {
    getLogger().info(`Executing ${arn} with ${JSON.stringify(payload)}`)
    try {
        const response = await client.invoke(
            arn,
            JSON.stringify({
                body: JSON.stringify(payload),
            })
        )
        const rawResult = response.Payload!.toString()
        const result = JSON.parse(rawResult)
        if (result.statusCode != 200) {
            throw new ToolkitError(`Server error(${result.statusCode}): ${result.body}`)
        }
        return JSON.parse(result.body) as TOutput
    } catch (e) {
        getLogger().error('Server side error', e)
        throw e instanceof ToolkitError ? e : ToolkitError.chain(e, 'Server side error')
    }
}
