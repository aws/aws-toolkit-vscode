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
    `java-gradle-plugin`
}


// Note: We can't use our standard source layout due to https://github.com/gradle/gradle/issues/14310

dependencies {
    implementation(libs.jacoco)
    implementation(libs.aws.codeGen)
    implementation(libs.bundles.jackson)
    implementation(libs.commonmark)
    implementation(libs.gradlePlugin.detekt)
    implementation(libs.gradlePlugin.intellij)
    implementation(libs.gradlePlugin.kotlin)
    implementation(libs.gradlePlugin.testLogger)
    implementation(libs.gradlePlugin.testRetry)
    implementation(libs.gradlePlugin.undercouch.download)
    implementation(libs.jgit)

    testImplementation(libs.assertj)
    testImplementation(libs.junit4)
    testImplementation(libs.bundles.mockito)
    testImplementation(gradleTestKit())

    testRuntimeOnly(libs.junit5.jupiterVintage)
}

tasks.test {
    useJUnitPlatform()
}
