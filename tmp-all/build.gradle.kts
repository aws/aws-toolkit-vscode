// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeVersions

plugins {
    id("org.jetbrains.intellij")
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
}

intellij {
    val ideProfile = IdeVersions.ideProfile(project)
    version.set(ideProfile.community.version())
    localPath.set(ideProfile.community.localPath())
    plugins.set(
        listOf(
            project(":plugin-core"),
            project(":plugin-amazonq"),
            "aws.toolkit:2.19-${ideProfile.shortName}"
        )
    )

    updateSinceUntilBuild.set(false)
    instrumentCode.set(false)
}
