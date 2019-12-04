// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.util.text.StringUtil
import java.io.File

class ExecutableDetector {

    fun find(paths: Array<String>, executables: Array<String>): String? {
        paths.forEach { path ->
            executables.forEach { executable ->
                val file = File(path, executable)
                if (file.exists()) {
                    return file.path
                }
            }
        }

        executables.forEach { executable ->
            val result = checkInPath(executable)
            if (result != null) {
                return result
            }
        }

        return null
    }

    private fun checkInPath(executableName: String): String? {
        val pathEnvVar = System.getenv(PATH_ENV) ?: return null
        val pathEntries = StringUtil.split(pathEnvVar, File.pathSeparator)
        pathEntries.forEach { pathEntry ->
            val f = File(pathEntry, executableName)
            if (f.exists()) {
                return f.path
            }
        }
        return null
    }

    private companion object {
        const val PATH_ENV = "PATH"
    }
}
