// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import com.github.gradle.node.npm.task.NpmTask

plugins {
    id("java")
    alias(libs.plugins.node.gradle)
}

// mynah build assumes 'build/' belongs to itself, which conflicts with gradle
buildDir = file("gradle_build")

val buildMynahUI = tasks.register<NpmTask>("buildMynahUI") {
    dependsOn(tasks.npmInstall)
    npmCommand.set(listOf("run", "build-ui"))

    inputs.dir("src")
    inputs.files(
        file("package.json"),
        file("package-lock.json"),
        file("tsconfig.json"),
        file("webpack.media.config.js")
    )

    outputs.dir(file("build"))
}

tasks.processResources {
    dependsOn(buildMynahUI)
}

tasks.jar {
    from(buildMynahUI) {
        into("mynah-ui")
    }
}
