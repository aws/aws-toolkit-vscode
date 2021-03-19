// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import org.jetbrains.intellij.tasks.PrepareSandboxTask
import org.jetbrains.intellij.tasks.PublishTask
import software.aws.toolkits.gradle.IdeVersions
import software.aws.toolkits.gradle.intellij

plugins {
    id("org.jetbrains.intellij")
}

val ideProfile = IdeVersions.ideProfile(project)

val publishToken: String by project
val publishChannel: String by project

intellij {
    version = ideProfile.community.sdkVersion
    pluginName = "aws-toolkit-jetbrains"
    updateSinceUntilBuild = false
}

tasks.getByName<PrepareSandboxTask>("prepareSandbox") {
    project.findProject(":jetbrains-rider")?.let {
        from(tasks.getByPath(":jetbrains-rider:prepareSandbox"))
    }
}

tasks.getByName<PublishTask>("publishPlugin") {
    token(publishToken)
    channels(publishChannel.split(",").map { it.trim() })
}

tasks.named("check") {
    dependsOn(tasks.named("verifyPlugin"))
}

dependencies {
    implementation(project(":jetbrains-ultimate"))
    project.findProject(":jetbrains-rider")?.let {
        implementation(it)
    }
}
