// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import java.nio.file.Path

data class Tool<out T : ToolType<*>>(val type: T, val path: Path) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as Tool<*>

        if (type.id != other.type.id) return false
        if (path != other.path) return false

        return true
    }

    override fun hashCode(): Int {
        var result = type.id.hashCode()
        result = 31 * result + path.hashCode()
        return result
    }
}
