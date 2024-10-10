/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts an array of key-value pairs into a Map object.
 *
 * @param {[unknown, unknown][]} arr - An array of tuples, where each tuple represents a key-value pair.
 * @returns {Map<unknown, unknown>} A new Map object created from the input array.
 *                                  If the conversion fails, an empty Map is returned.
 *
 * @example
 * const array = [['key1', 'value1'], ['key2', 'value2']];
 * const map = tryNewMap(array);
 * // map is now a Map object with entries: { 'key1' => 'value1', 'key2' => 'value2' }
 */
export function tryNewMap(arr: [unknown, unknown][]) {
    try {
        return new Map(arr)
    } catch (error) {
        return new Map()
    }
}
