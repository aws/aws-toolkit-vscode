// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

val kotlinVersion: String by project
val detektVersion: String by project
val junitVersion: String by project
val assertjVersion: String by project

plugins {
    kotlin
    id("toolkit-testing")
    id("toolkit-detekt")
}

dependencies {
    implementation("io.gitlab.arturbosch.detekt:detekt-api:$detektVersion")
    testImplementation("io.gitlab.arturbosch.detekt:detekt-test:$detektVersion")
    testImplementation("junit:junit:$junitVersion")
    testImplementation("org.assertj:assertj-core:$assertjVersion")
}
