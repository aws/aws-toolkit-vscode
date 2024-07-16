// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import org.jetbrains.intellij.platform.gradle.Constants.Tasks
import org.jetbrains.intellij.platform.gradle.tasks.PatchPluginXmlTask

plugins {
    id("temp-toolkit-intellij-root-conventions")
}

intellijPlatform {
    projectName = "aws-toolkit-jetbrains-standalone"
}

dependencies {
    intellijPlatform {
        localPlugin(project(":plugin-core", "pluginZip"))
    }
}

tasks.jarSearchableOptions {
    dependsOn(":plugin-toolkit:jetbrains-core:${Tasks.PATCH_PLUGIN_XML}")

    pluginXml.set(project(":plugin-toolkit:jetbrains-core").tasks.maybeCreate<PatchPluginXmlTask>(Tasks.PATCH_PLUGIN_XML).outputFile)
}

tasks.check {
    val serviceSubdirs = project(":plugin-toolkit").subprojects
        .map { it.name }.filter { it != "intellij" }.filter { it != "intellij-standalone" }
    serviceSubdirs.forEach {
        dependsOn(":plugin-toolkit:$it:check")
    }
}
