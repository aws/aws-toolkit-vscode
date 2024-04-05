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
    implementation(project(":plugin-amazonq:shared:jetbrains-community"))
    // hack because transform has a chat entrypoint
    implementation(project(":plugin-amazonq:chat:jetbrains-community"))

    compileOnly(project(":plugin-core:jetbrains-community"))

    testImplementation(testFixtures(project(":plugin-core:jetbrains-community")))
}

// hack because our test structure currently doesn't make complete sense
tasks.prepareTestingSandbox {
    val pluginXmlJar = project(":plugin-amazonq").tasks.jar

    dependsOn(pluginXmlJar)
    intoChild(pluginName.map { "$it/lib" })
        .from(pluginXmlJar)
}
