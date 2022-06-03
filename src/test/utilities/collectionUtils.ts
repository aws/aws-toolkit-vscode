/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: what is the point of this? should it live in src/shared/utilities/collectionUtils.ts ?
export async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}
