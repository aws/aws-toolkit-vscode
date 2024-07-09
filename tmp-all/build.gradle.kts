// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ

plugins {
    id("toolkit-intellij-plugin")
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IC)
}

dependencies {
    intellijPlatform {
        val type = toolkitIntelliJ.ideFlavor.map { IntelliJPlatformType.fromCode(it.toString()) }
        val version = toolkitIntelliJ.version()

        create(type, version)
        jetbrainsRuntime()

        localPlugin(project(":plugin-core", "pluginZip"))
        localPlugin(project(":plugin-amazonq", "pluginZip"))
        plugin(toolkitIntelliJ.ideProfile().map { "aws.toolkit:2.19-${it.shortName}" })

        testFramework(TestFrameworkType.Bundled)
        testFramework(TestFrameworkType.JUnit5)
    }
}
