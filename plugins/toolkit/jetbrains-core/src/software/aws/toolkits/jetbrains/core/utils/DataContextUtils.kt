// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.utils

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.DataKey

/**
 * Returns the specified DataKey from the DataContext. If not found, it will throw an exception
 */
fun <T> DataContext.getRequiredData(dataId: DataKey<T>): T = this.getData(dataId) ?: throw IllegalStateException("Required dataId '${dataId.name}` was missing")
