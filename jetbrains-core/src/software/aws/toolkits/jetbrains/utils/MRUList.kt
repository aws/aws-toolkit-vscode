// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

class MRUList<T>(private val maxSize: Int) {
    private val internalList = mutableListOf<T>()

    fun add(element: T) {
        internalList.remove(element)
        internalList.add(0, element)
        trimToSize()
    }

    fun elements(): List<T> = internalList.toList()

    fun clear() {
        internalList.clear()
    }

    private fun trimToSize() {
        while (internalList.size > maxSize) {
            internalList.removeAt(internalList.size - 1)
        }
    }
}
