// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.openapi.util.SystemInfo
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermissions

object SamCommonTestUtils {
    fun getVersionAsJson(version: String): String {
        val tree = SamCommon.mapper.createObjectNode()
        tree.put(SamCommon.SAM_INFO_VERSION_KEY, version)
        return SamCommon.mapper.writeValueAsString(tree)
    }

    fun getMinVersionAsJson() = getVersionAsJson(SamExecutable().samMinVersion.toString())

    fun getMaxVersionAsJson() = getVersionAsJson(SamExecutable().samMaxVersion.toString())

    fun makeATestSam(message: String, path: String? = null, exitCode: Int = 0): Path {
        val sam = path?.let {
            Paths.get(it)
        } ?: Files.createTempFile(
            "sam",
            if (SystemInfo.isWindows) ".bat" else ".sh"
        )

        val stream = if (exitCode == 0) 1 else 2

        val contents = if (SystemInfo.isWindows) {
            """
                @echo off
                echo${if (message.isEmpty()) "." else " $message"} ${if (stream != 1) "1>&$stream" else ""}
                exit $exitCode
            """.trimIndent()
        } else {
            """
                echo '$message' >&$stream
                exit $exitCode
            """.trimIndent()
        }
        Files.write(sam, contents.toByteArray())

        if (SystemInfo.isUnix) {
            Files.setPosixFilePermissions(
                sam,
                PosixFilePermissions.fromString("r-xr-xr-x")
            )
        }

        return sam
    }
}
