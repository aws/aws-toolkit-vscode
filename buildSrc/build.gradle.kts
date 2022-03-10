// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

buildscript {
    // This has to be here otherwise properties are not loaded and nothing works
    val props = `java.util`.Properties()
    file("${project.projectDir.parent}/gradle.properties").inputStream().use { props.load(it) }
    props.entries.forEach { project.extensions.add(it.key.toString(), it.value) }
}

plugins {
    `kotlin-dsl`
}

// Note: We can't use our standard source layout due to https://github.com/gradle/gradle/issues/14310

dependencies {
    compileOnly(deps.jacoco)
    implementation(deps.aws.codeGen)
    implementation(deps.bundles.jackson)
    implementation(deps.commonmark)
    implementation(deps.gradlePlugin.detekt)
    implementation(deps.gradlePlugin.intellij)
    implementation(deps.gradlePlugin.kotlin)
    implementation(deps.gradlePlugin.testLogger)
    implementation(deps.gradlePlugin.testRetry)
    implementation(deps.jgit)

    testImplementation(deps.assertj)
    testImplementation(deps.junit4)
    testImplementation(deps.bundles.mockito)

    testRuntimeOnly(deps.junit5.jupiterVintage)
}

tasks.test {
    useJUnitPlatform()
}
