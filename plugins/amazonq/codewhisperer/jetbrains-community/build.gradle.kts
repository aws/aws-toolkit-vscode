// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("toolkit-intellij-subplugin")
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IC)
}

intellij {
    plugins.add(project(":plugin-core"))
}

dependencies {
    compileOnly(project(":plugin-core:jetbrains-community"))

    implementation(project(":plugin-amazonq:shared:jetbrains-community"))
    // CodeWhispererTelemetryService uses a CircularFifoQueue, previously transitive from zjsonpatch
    implementation(libs.commons.collections)

    testFixturesApi(testFixtures(project(":plugin-core:jetbrains-community")))
    testFixturesApi(project(path = ":plugin-toolkit:jetbrains-core", configuration = "testArtifacts"))
}

// hack because our test structure currently doesn't make complete sense
tasks.prepareTestingSandbox {
    val pluginXmlJar = project(":plugin-amazonq").tasks.jar

    dependsOn(pluginXmlJar)
    intoChild(pluginName.map { "$it/lib" })
        .from(pluginXmlJar)
}
