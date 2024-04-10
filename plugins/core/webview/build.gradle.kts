// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import com.github.gradle.node.npm.task.NpmTask

plugins {
    id("java")
    alias(libs.plugins.node.gradle)
}

buildDir = file("gradle_build")

val buildGetStartUI = tasks.register<NpmTask>("buildWebviewUI") {
    dependsOn(tasks.npmInstall)
    npmCommand.set(listOf("run", "build-ui"))

    inputs.dir("src")
    inputs.files(
        file("package.json"),
        file("package-lock.json"),
        file("tsconfig.json"),
        file("webpack.config.js")
    )

    outputs.dir(file("build"))
}

tasks.processResources {
    dependsOn(buildGetStartUI)
}

tasks.jar {
    from(buildGetStartUI) {
        into("webview")
    }
}
