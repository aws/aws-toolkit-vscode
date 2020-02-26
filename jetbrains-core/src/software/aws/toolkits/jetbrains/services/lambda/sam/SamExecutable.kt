// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.openapi.util.SystemInfo
import com.intellij.util.text.SemVer
import software.aws.toolkits.jetbrains.core.executables.AutoResolvable
import software.aws.toolkits.jetbrains.core.executables.ExecutableCommon
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.core.executables.Validatable
import software.aws.toolkits.jetbrains.settings.ExecutableDetector
import java.nio.file.Path
import java.nio.file.Paths

class SamExecutable : ExecutableType<SemVer>, AutoResolvable, Validatable {
    override val displayName: String = "sam"
    override val id: String = "samCli"

    // inclusive
    val samMinVersion = SemVer("0.38.0", 0, 38, 0)
    // exclusive
    val samMaxVersion = SemVer("0.50.0", 0, 50, 0)

    override fun version(path: Path): SemVer = ExecutableCommon.getVersion(
        path.toString(),
        SamVersionCache,
        this.displayName
    )

    override fun validate(path: Path) {
        val version = this.version(path)
        ExecutableCommon.checkSemVerVersion(
            version,
            samMinVersion,
            samMaxVersion,
            this.displayName
        )
    }

    override fun resolve(): Path? {
        val path = (if (SystemInfo.isWindows) {
            ExecutableDetector().find(
                arrayOf("C:\\Program Files\\Amazon\\AWSSAMCLI\\bin", "C:\\Program Files (x86)\\Amazon\\AWSSAMCLI\\bin"),
                arrayOf("sam.cmd", "sam.exe")
            )
        } else {
            ExecutableDetector().find(
                arrayOf("/usr/local/bin", "/usr/bin"),
                arrayOf("sam")
            )
        }) ?: return null

        return Paths.get(path)
    }
}
