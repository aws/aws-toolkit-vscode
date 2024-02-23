// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.execution.Location

/**
 * Implemented by explorer resources that have an associated PSI location
 */
interface ResourceLocationNode {
    fun location(): Location<*>? = null
}
