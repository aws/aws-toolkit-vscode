// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ

plugins {
    id("toolkit-intellij-plugin")
    id("org.jetbrains.intellij")
}

toolkitIntelliJ.apply {
    val runIdeVariant = providers.gradleProperty("runIdeVariant")
    ideFlavor.set(IdeFlavor.values().firstOrNull { it.name == runIdeVariant.orNull } ?: IdeFlavor.IC)
}

intellij {
    version.set(toolkitIntelliJ.version())
    localPath.set(toolkitIntelliJ.localPath())
    plugins.set(
        listOf(
            project(":plugin-core"),
            project(":plugin-amazonq"),
            project(":plugin-toolkit:intellij-standalone"),
        )
    )

    updateSinceUntilBuild.set(false)
    instrumentCode.set(false)
}

tasks.buildPlugin {
    doFirst {
        throw GradleException("This project does not produce an artifact. Use project-specific command, e.g. :plugin-toolkit:intellij-standalone:runIde")
    }
}
