// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.resources.message

fun ResourceSelector<*>.waitToLoad() {
    runBlocking {
        // State gets set before the selected item gets set so we need to check for that too
        waitForTrue { selectedItem != message("loading_resource.loading") }
        waitForFalse { isLoading }
    }
}

suspend fun ListTableModel<*>.waitForModelToBeAtLeast(size: Int) {
    waitForFalse { items.size < size }
}

suspend fun waitForFalse(block: () -> Boolean) {
    while (block()) {
        delay(10)
    }
}

suspend fun waitForTrue(block: () -> Boolean) {
    while (!block()) {
        delay(10)
    }
}
