/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}
