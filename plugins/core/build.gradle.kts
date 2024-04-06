// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.IdeVersions

plugins {
    id("org.jetbrains.intellij")
}

val ideProfile = IdeVersions.ideProfile(project)

val toolkitVersion: String by project
val publishToken: String by project
val publishChannel: String by project

version = "$toolkitVersion-${ideProfile.shortName}"

intellij {
    version.set(ideProfile.community.version())
    localPath.set(ideProfile.community.localPath())

    updateSinceUntilBuild.set(false)
    instrumentCode.set(false)
}

dependencies {
    implementation(project(":plugin-core:sdk-codegen"))
    implementation(project(":plugin-core:jetbrains-community"))
    implementation(project(":plugin-core:jetbrains-ultimate"))
}

configurations {
    // Make sure we exclude stuff we either A) ships with IDE, B) we don't use to cut down on size
    runtimeClasspath {
        exclude(group = "org.slf4j")
        exclude(group = "org.jetbrains.kotlin")
        exclude(group = "org.jetbrains.kotlinx")
    }
}
