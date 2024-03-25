// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("java-library")
    id("toolkit-intellij-subplugin")
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IC)
}

intellij {
    plugins.set(
        listOf(
            project(":plugin-core")
        )
    )
}

dependencies {
    compileOnly(project(":plugin-core:jetbrains-community"))

    // delete when fully split
    compileOnlyApi(project(":plugin-toolkit:jetbrains-core"))
    runtimeOnly(project(":plugin-toolkit:jetbrains-core")) {
        // dont pull in any of the SDKs / other nonsense needed at runtime because it's provided by :plugin-core
        isTransitive = false
    }
    // CodeWhispererTelemetryService uses a CircularFifoQueue
    implementation(libs.commons.collections)
}
