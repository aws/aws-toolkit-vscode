/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from '../crypto'
import { RecordMap } from '../utilities/map'
import { AsyncLocalStorage } from './spans'

export class Trace {
    readonly #context = new AsyncLocalStorage<{
        traceId: string
    }>()

    getTraceId() {
        return this.#context.getStore()?.traceId ?? randomUUID()
    }

    isActive() {
        return this.#context.getStore() !== undefined
    }

    /**
     * Executes the provided callback function.
     *
     * Sub functions that are wrapped can access the trace id using
     * getCurrentId()
     */
    public run<T>(fn: () => T): T {
        const result = this.#context.run(
            {
                traceId: this.getTraceId(),
            },
            fn
        )

        if (result instanceof Promise) {
            return result
        }

        return result
    }
}

export const trace = new Trace()
export const traceEvents = new RecordMap()
