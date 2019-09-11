// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.text.StringUtil
import java.io.File

open class SamExecutableDetector {
    fun detect(): String? = if (SystemInfo.isWindows) {
        detectForWindows()
    } else {
        detectForUnix()
    }

    private fun detectForWindows(): String? {
        WINDOWS_PATHS.forEach { path ->
            WINDOWS_EXECUTABLES.forEach { executable ->
                val file = file(path, executable)
                if (file.exists()) {
                    return file.path
                }
            }
        }

        WINDOWS_EXECUTABLES.forEach { executable ->
            val result = checkInPath(executable)
            if (result != null) {
                return result
            }
        }

        return null
    }

    private fun detectForUnix(): String? {
        UNIX_PATHS.forEach { path ->
            val file = file(path, UNIX_EXECUTABLE)
            if (file.exists()) {
                return file.path
            }
        }
        return checkInPath(UNIX_EXECUTABLE)
    }

    private fun checkInPath(executableName: String): String? {
        val pathEnvVar = System.getenv(PATH_ENV) ?: return null
        val pathEntries = StringUtil.split(pathEnvVar, File.pathSeparator)
        pathEntries.forEach { pathEntry ->
            val f = file(pathEntry, executableName)
            if (f.exists()) {
                return f.path
            }
        }
        return null
    }

    protected open fun file(folder: String, name: String) = File(folder, name)

    private companion object {
        val UNIX_PATHS = arrayOf("/usr/local/bin", "/usr/bin")
        const val UNIX_EXECUTABLE = "sam"

        val WINDOWS_PATHS = arrayOf("C:\\Program Files\\Amazon\\AWSSAMCLI\\bin", "C:\\Program Files (x86)\\Amazon\\AWSSAMCLI\\bin")
        val WINDOWS_EXECUTABLES = arrayOf("sam.cmd", "sam.exe")

        const val PATH_ENV = "PATH"
    }
}
