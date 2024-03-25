// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("java-library")
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
    id("toolkit-intellij-subplugin")
    id("toolkit-integration-testing")
}

dependencies {
    compileOnlyApi(project(":plugin-toolkit:jetbrains-core"))
    compileOnlyApi(project(":plugin-core:jetbrains-ultimate"))

    testImplementation(testFixtures(project(":plugin-core:jetbrains-community")))
    testImplementation(project(":plugin-toolkit:jetbrains-core"))
    testImplementation(project(path = ":plugin-toolkit:jetbrains-core", configuration = "testArtifacts"))
    testImplementation(project(path = ":plugin-toolkit:core", configuration = "testArtifacts"))
    testImplementation(libs.mockk)

    // delete when fully split
    testRuntimeOnly(project(":plugin-core:jetbrains-ultimate"))
    testRuntimeOnly(project(":plugin-amazonq", "moduleOnlyJars"))
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IU)
}
