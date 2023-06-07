/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncCollection, toCollection } from '../../shared/utilities/asyncCollection'

// TODO: what is the point of this? should it live in src/shared/utilities/collectionUtils.ts ?
export async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

export function intoCollection<T>(arr: T[]): AsyncCollection<T> {
    return toCollection(async function* () {
        yield* arr
    })
}

export function createCollectionFromPages<T>(...pages: T[]): AsyncCollection<T> {
    return toCollection(async function* () {
        for (let i = 0; i < pages.length - 1; i++) {
            yield pages[i]
        }

        return pages[pages.length - 1]
    })
}
