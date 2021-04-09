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
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310:$jacksonVersion")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:$jacksonVersion")
    implementation("org.eclipse.jgit:org.eclipse.jgit:$jgitVersion")
    implementation("org.commonmark:commonmark:$commonsMarkVersion")

    implementation("software.amazon.awssdk:codegen:$awsSdkVersion")

    implementation("org.jetbrains.intellij.plugins:gradle-intellij-plugin:$ideaPluginVersion")

    implementation("org.jlleitschuh.gradle:ktlint-gradle:$ktintPluginVersion")
    compileOnly("com.pinterest.ktlint:ktlint-core:$ktlintVersion")
    implementation("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")
    testImplementation("com.pinterest.ktlint:ktlint-core:$ktlintVersion")
    testImplementation("com.pinterest.ktlint:ktlint-test:$ktlintVersion")

    implementation("org.jacoco:org.jacoco.core:${JacocoPlugin.DEFAULT_JACOCO_VERSION}")
    implementation("org.gradle:test-retry-gradle-plugin:$gradleRetryPluginVersion")
    implementation("com.adarshr:gradle-test-logger-plugin:$gradleTestLoggerPlugin")

    testImplementation("org.assertj:assertj-core:$assertjVersion")
    testImplementation("junit:junit:$junitVersion")
    testImplementation("org.mockito.kotlin:mockito-kotlin:$mockitoKotlinVersion")
    testImplementation("org.mockito:mockito-core:$mockitoVersion")
}
