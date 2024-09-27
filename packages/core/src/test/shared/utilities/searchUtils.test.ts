/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { binarySearch } from '../../../shared/utilities/searchUtils'

describe('binarySearch', () => {
    it('should find the index of an element in a sorted array', () => {
        const sortedArrayOdd = [1, 3, 5, 7, 9]
        assert.strictEqual(binarySearch(sortedArrayOdd, 3), 1)
        assert.strictEqual(binarySearch(sortedArrayOdd, 1), 0)
        assert.strictEqual(binarySearch(sortedArrayOdd, 9), 4)

        const sortedArrayEven = [1, 3, 5, 7] // even number of items
        assert.strictEqual(binarySearch(sortedArrayEven, 3), 1)
        assert.strictEqual(binarySearch(sortedArrayEven, 1), 0)
    })

    it('should return -1 if the element is not found', () => {
        const sortedArray = [1, 3, 5, 7, 9]
        assert.strictEqual(binarySearch(sortedArray, 2), -1)
        assert.strictEqual(binarySearch(sortedArray, 6), -1)
        assert.strictEqual(binarySearch(sortedArray, 10), -1)
    })

    it('should work with an empty array', () => {
        const emptyArray: number[] = []
        assert.strictEqual(binarySearch(emptyArray, 1), -1)
    })

    it('should work with an array of length 1', () => {
        const singleElementArray = [5]
        assert.strictEqual(binarySearch(singleElementArray, 5), 0)
        assert.strictEqual(binarySearch(singleElementArray, 1), -1)
    })

    it('should find the correct index in a large sorted array', () => {
        const largeArray = Array.from({ length: 1000 }, (_, i) => i * 2)
        assert.strictEqual(binarySearch(largeArray, 500), 250)
        assert.strictEqual(binarySearch(largeArray, 998), 499)
    })

    it('should return the correct index for duplicate elements', () => {
        const arrayWithDuplicates = [1, 2, 2, 2, 3, 4, 5]
        // Note: This assumes the binarySearch returns the index of any matching element
        const result = binarySearch(arrayWithDuplicates, 2)
        assert(result >= 1 && result <= 3)
    })
})
