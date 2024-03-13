// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("toolkit-intellij-subplugin")
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IC)
}

dependencies {
    compileOnly(project(":plugin-core:jetbrains-community"))

    // delete when fully split
    compileOnly(project(":plugin-toolkit:jetbrains-core", "instrumentedJar"))
}
