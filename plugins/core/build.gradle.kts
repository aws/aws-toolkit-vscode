// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

plugins {
    id("toolkit-publishing-conventions")
    id("toolkit-publish-root-conventions")
    id("toolkit-jvm-conventions")
    id("toolkit-testing")
}

dependencies {
    implementation(project(":plugin-core:core"))
    implementation(project(":plugin-core:jetbrains-community"))
    implementation(project(":plugin-core:jetbrains-ultimate"))
    implementation(project(":plugin-core:resources"))
    implementation(project(":plugin-core:sdk-codegen"))
    implementation(project(":plugin-core:webview"))
}

tasks.check {
    val coreProject = project(":plugin-core").subprojects
    coreProject.forEach {
        dependsOn(":plugin-core:${it.name}:check")
    }
}
