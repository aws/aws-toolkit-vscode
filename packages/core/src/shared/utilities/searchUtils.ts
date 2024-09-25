/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Performs a binary search on a sorted array of numbers to find the index of a target value.
 *
 * @param items The sorted array of numbers to search.
 * @param target The target value to search for.
 * @returns The index of the target value in the array, or -1 if not found.
 */
export function binarySearch(items: number[], target: number): number {
    let low = 0
    let high = items.length - 1

    while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        const midValue = items[mid]

        if (midValue === target) {
            return mid
        } else if (midValue < target) {
            low = mid + 1
        } else {
            high = mid - 1
        }
    }

    return -1
}
