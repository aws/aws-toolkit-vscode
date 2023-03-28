// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
    id("toolkit-integration-testing")
    id("toolkit-intellij-subplugin")
}

dependencies {
    compileOnly(project(":jetbrains-core"))
    runtimeOnly(project(":jetbrains-core", "instrumentedJar"))

    testCompileOnly(project(":jetbrains-core"))
    testRuntimeOnly(project(":jetbrains-core", "instrumentedJar"))
    testImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    testImplementation(libs.mockk)
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IU)
}
