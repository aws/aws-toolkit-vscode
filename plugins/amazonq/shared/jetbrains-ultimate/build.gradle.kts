// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("toolkit-intellij-subplugin")
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IU)
}

dependencies {
    compileOnly(project(":plugin-amazonq:shared:jetbrains-community"))
    compileOnly(project(":plugin-core:jetbrains-ultimate"))

    // delete when fully split
    implementation(project(":plugin-toolkit:jetbrains-ultimate"))
}
