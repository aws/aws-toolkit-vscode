// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

/**
 * Removes all items in this collection and replaces them with the items in the [other] collection
 */
fun <T> MutableCollection<T>.replace(other: Collection<T>) {
    this.clear()
    this.addAll(other)
}
