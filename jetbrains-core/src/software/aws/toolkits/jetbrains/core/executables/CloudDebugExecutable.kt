// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.openapi.util.SystemInfo
import com.intellij.util.text.SemVer

import software.aws.toolkits.jetbrains.settings.ExecutableDetector
import java.nio.file.Path
import java.nio.file.Paths

class CloudDebugExecutable : ExecutableType<SemVer>, AutoResolvable, Validatable {

    override val id: String = "cloud-debugCli"
    override val displayName: String = "cloud-debug"

    override fun version(path: Path): SemVer =
        ExecutableCommon.getVersion(path.toString(), CloudDebugVersionCache, this.displayName)

    override fun validate(path: Path) {
        val version = this.version(path)
        ExecutableCommon.checkSemVerVersion(version, MIN_VERSION, MAX_VERSION, this.displayName)
    }

    override fun resolve(): Path? {
        val pathArr = if (SystemInfo.isWindows) {
            arrayOf("cloud-debug.exe")
        } else {
            arrayOf("cloud-debug")
        }
        val executablePath: String? = ExecutableDetector().find(arrayOf(ExecutableType.EXECUTABLE_DIRECTORY.toString()), pathArr)

        if (executablePath != null) return Paths.get(executablePath)
        return null
    }

    companion object {
        // Based on how the manifest is constructed, a minor version bump will constitute a breaking change
        // Min version and max version should be spaced 1 minor version (or 1 major version) apart.
        // This will preserve backwards compatibility as we can always look at the min version's major/minor to find a working executable
        val MAX_VERSION: SemVer = SemVer("2.0.0", 2, 0, 0) // exclusive
        val MIN_VERSION: SemVer = SemVer("1.0.209", 1, 0, 209) // inclusive
    }
}
