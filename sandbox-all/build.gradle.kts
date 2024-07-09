// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ

plugins {
    id("toolkit-intellij-plugin")
    id("org.jetbrains.intellij.platform")
}

toolkitIntelliJ.apply {
    val runIdeVariant = providers.gradleProperty("runIdeVariant")
    ideFlavor.set(IdeFlavor.values().firstOrNull { it.name == runIdeVariant.orNull } ?: IdeFlavor.IC)
}

tasks.verifyPlugin {
    isEnabled = false
}

tasks.buildPlugin {
    doFirst {
        throw StopActionException("This project does not produce an artifact. Use project-specific command, e.g. :plugin-toolkit:intellij-standalone:runIde")
    }
}

dependencies {
    intellijPlatform {
        val type = toolkitIntelliJ.ideFlavor.map { IntelliJPlatformType.fromCode(it.toString()) }
        val version = toolkitIntelliJ.version()

        create(type, version)
        jetbrainsRuntime()

        localPlugin(project(":plugin-core", "pluginZip"))
        localPlugin(project(":plugin-amazonq", "pluginZip"))
        localPlugin(project(":plugin-toolkit:intellij-standalone", "pluginZip"))
    }
}
