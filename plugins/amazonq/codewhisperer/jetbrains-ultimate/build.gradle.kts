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
    intellijPlatform {
        localPlugin(project(":plugin-core"))
    }

    compileOnly(project(":plugin-amazonq:codewhisperer:jetbrains-community"))
    compileOnly(project(":plugin-amazonq:shared:jetbrains-ultimate"))

    compileOnly(project(":plugin-core:jetbrains-ultimate"))

    testImplementation(testFixtures(project(":plugin-amazonq:codewhisperer:jetbrains-community")))
    testImplementation(project(path = ":plugin-toolkit:jetbrains-ultimate", configuration = "testArtifacts"))
}
