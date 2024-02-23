// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
    id("toolkit-intellij-subplugin")
    id("toolkit-integration-testing")
}

dependencies {
    compileOnly(project(":plugin-toolkit:jetbrains-core"))
    runtimeOnly(project(":plugin-toolkit:jetbrains-core", "instrumentedJar"))

    testCompileOnly(project(":plugin-toolkit:jetbrains-core"))
    testRuntimeOnly(project(":plugin-toolkit:jetbrains-core", "instrumentedJar"))
    testImplementation(project(path = ":plugin-toolkit:jetbrains-core", configuration = "testArtifacts"))
    testImplementation(project(path = ":plugin-toolkit:core", configuration = "testArtifacts"))
    testImplementation(libs.mockk)
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IU)
}
