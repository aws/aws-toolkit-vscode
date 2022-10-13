// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-intellij-subplugin")
    id("toolkit-testing")
    id("toolkit-integration-testing")
}

dependencies {
    api(project(":jetbrains-core"))

    testImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    testImplementation(libs.mockk)

    integrationTestImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IU)
}
