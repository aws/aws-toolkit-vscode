// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.tasks.BuildPluginTask
import org.jetbrains.intellij.tasks.PatchPluginXmlTask
import software.aws.toolkits.gradle.buildMetadata
import software.aws.toolkits.gradle.intellij.IdeVersions
import software.aws.toolkits.gradle.intellij.ToolkitIntelliJExtension
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ
import software.aws.toolkits.gradle.isCi

plugins {
    id("toolkit-intellij-plugin")
}

val ideProfile = IdeVersions.ideProfile(project)
val toolkitVersion: String by project

// please check changelog generation logic if this format is changed
version = "$toolkitVersion-${ideProfile.shortName}"

tasks.withType<PatchPluginXmlTask>().all {
    sinceBuild.set(toolkitIntelliJ.ideProfile().map { it.sinceVersion })
    untilBuild.set(toolkitIntelliJ.ideProfile().map { it.untilVersion })
}

// attach the current commit hash on local builds
if (!project.isCi()) {
    val buildMetadata = buildMetadata()
    tasks.withType<PatchPluginXmlTask>().all {
        version.set("${project.version}+$buildMetadata")
    }

    tasks.named<BuildPluginTask>("buildPlugin") {
        archiveClassifier.set(buildMetadata)
    }
}
