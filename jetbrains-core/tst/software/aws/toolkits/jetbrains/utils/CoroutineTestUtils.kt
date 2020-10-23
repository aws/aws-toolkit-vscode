// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.jetbrains.ui.ResourceSelector

fun ResourceSelector<*>.waitToLoad() {
    runBlocking {
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
