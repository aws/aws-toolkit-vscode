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

    implementation(kotlin("gradle-plugin", kotlinVersion))

    implementation("software.amazon.awssdk:codegen:$awsSdkVersion")

    implementation("org.jetbrains.intellij.plugins:gradle-intellij-plugin:$ideaPluginVersion")

    implementation("org.jacoco:org.jacoco.core:${JacocoPlugin.DEFAULT_JACOCO_VERSION}")
    implementation("org.gradle:test-retry-gradle-plugin:$gradleRetryPluginVersion")
    implementation("com.adarshr:gradle-test-logger-plugin:$gradleTestLoggerPlugin")

    implementation("io.gitlab.arturbosch.detekt:detekt-gradle-plugin:$detektVersion")

    testImplementation("org.assertj:assertj-core:$assertjVersion")
    testImplementation("junit:junit:$junitVersion")
    testImplementation("org.mockito.kotlin:mockito-kotlin:$mockitoKotlinVersion")
    testImplementation("org.mockito:mockito-core:$mockitoVersion")
}
